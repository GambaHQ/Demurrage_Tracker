// Deadhead Trip History Screen
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Card, Title, Text, List, Chip, ActivityIndicator, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as api from '../services/api';

export default function DeadheadHistoryScreen() {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const response = await api.getDeadheadTrips();
      if (response.success && response.data) {
        setTrips(response.data);
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTrips();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading trips...</Text>
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="truck-fast-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No deadrunning trips yet</Text>
        <Text style={styles.emptySubtext}>
          Start tracking your first trip from the Deadrunning tab
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card style={styles.summaryCard}>
        <Card.Content>
          <Title>Trip Summary</Title>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Trips</Text>
              <Text style={styles.summaryValue}>{trips.length}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total KM</Text>
              <Text style={styles.summaryValue}>
                {trips.reduce((sum, trip) => sum + (trip.totalKm || 0), 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Breaks</Text>
              <Text style={styles.summaryValue}>
                {trips.reduce((sum, trip) => sum + (trip.breaks?.length || 0), 0)}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {trips.map((trip) => (
        <Card key={trip.id} style={styles.tripCard}>
          <Card.Content>
            <View style={styles.tripHeader}>
              <View style={styles.tripHeaderLeft}>
                <MaterialCommunityIcons name="truck-fast" size={24} color="#2196F3" />
                <View style={styles.tripHeaderText}>
                  <Text style={styles.tripRego}>{trip.truckRego}</Text>
                  {trip.trailerRego && (
                    <Text style={styles.tripTrailer}>+ {trip.trailerRego}</Text>
                  )}
                </View>
              </View>
              <Chip mode="flat" style={styles.completeChip}>
                Complete
              </Chip>
            </View>

            <Divider style={styles.divider} />

            <List.Item
              title="Date"
              description={formatDate(trip.startTime)}
              left={(props) => <List.Icon {...props} icon="calendar" />}
              style={styles.listItem}
            />

            <List.Item
              title="Time"
              description={`${formatTime(trip.startTime)} - ${formatTime(trip.endTime)}`}
              left={(props) => <List.Icon {...props} icon="clock-outline" />}
              style={styles.listItem}
            />

            <List.Item
              title="Distance"
              description={`${trip.startOdometer.toLocaleString()} km → ${trip.endOdometer.toLocaleString()} km (${trip.totalKm} km traveled)`}
              left={(props) => <List.Icon {...props} icon="speedometer" />}
              style={styles.listItem}
            />

            <List.Item
              title="Travel Time"
              description={formatDuration(trip.travelMinutes)}
              left={(props) => <List.Icon {...props} icon="timer-outline" />}
              style={styles.listItem}
            />

            {trip.breaks && trip.breaks.length > 0 && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.breaksSection}>
                  <View style={styles.breaksSectionHeader}>
                    <MaterialCommunityIcons name="coffee" size={20} color="#FF9800" />
                    <Text style={styles.breaksSectionTitle}>
                      Breaks ({trip.breaks.length})
                    </Text>
                  </View>
                  <Text style={styles.breaksSectionSubtitle}>
                    Total Break Time: {formatDuration(trip.totalBreakMinutes)}
                  </Text>
                  {trip.breaks.map((breakItem: any, index: number) => (
                    <View key={breakItem.id} style={styles.breakItem}>
                      <Text style={styles.breakNumber}>#{index + 1}</Text>
                      <View style={styles.breakDetails}>
                        <Text style={styles.breakTime}>
                          {formatTime(breakItem.startTime)} - {formatTime(breakItem.endTime)}
                        </Text>
                        <Text style={styles.breakDuration}>
                          {formatDuration(breakItem.durationMinutes)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {trip.startLocation?.address && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.locationSection}>
                  <View style={styles.locationItem}>
                    <MaterialCommunityIcons
                      name="map-marker-check"
                      size={20}
                      color="#4CAF50"
                    />
                    <View style={styles.locationText}>
                      <Text style={styles.locationLabel}>Start</Text>
                      <Text style={styles.locationAddress}>
                        {trip.startLocation.address}
                      </Text>
                    </View>
                  </View>
                  {trip.endLocation?.address && (
                    <View style={styles.locationItem}>
                      <MaterialCommunityIcons
                        name="map-marker-check"
                        size={20}
                        color="#f44336"
                      />
                      <View style={styles.locationText}>
                        <Text style={styles.locationLabel}>End</Text>
                        <Text style={styles.locationAddress}>
                          {trip.endLocation.address}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}

            {trip.userName && (
              <View style={styles.driverInfo}>
                <MaterialCommunityIcons name="account" size={16} color="#666" />
                <Text style={styles.driverName}>Driver: {trip.userName}</Text>
              </View>
            )}
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  summaryCard: {
    margin: 16,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  tripCard: {
    margin: 16,
    marginTop: 8,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tripHeaderText: {
    flexDirection: 'column',
  },
  tripRego: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tripTrailer: {
    fontSize: 14,
    color: '#666',
  },
  completeChip: {
    backgroundColor: '#4CAF50',
  },
  divider: {
    marginVertical: 12,
  },
  listItem: {
    paddingHorizontal: 0,
  },
  breaksSection: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  breaksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  breaksSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  breaksSectionSubtitle: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 12,
  },
  breakItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    gap: 12,
  },
  breakNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    minWidth: 24,
  },
  breakDetails: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakTime: {
    fontSize: 14,
    color: '#333',
  },
  breakDuration: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  locationSection: {
    marginTop: 8,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  locationText: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 14,
    color: '#333',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  driverName: {
    fontSize: 12,
    color: '#666',
  },
});
