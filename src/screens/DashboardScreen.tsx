// Dashboard screen - Admin overview with stats
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Text,
  Surface,
  useTheme,
  Chip,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/appStore';
import { getWeekRangeDisplay, formatMinutesToHHMM } from '../utils/dateUtils';
import { getStopEventsByWeek } from '../services/database';
import * as api from '../services/api';

export default function DashboardScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [chartData, setChartData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const screenWidth = Dimensions.get('window').width;
  
  const {
    isTracking,
    currentStopEvent,
    motionState,
    currentWeekDemurrage,
    refreshAllData,
    user,
    company,
  } = useAppStore();
  const [weeklySummary, setWeeklySummary] = useState<any>(null);

  // Load chart data and weekly summary
  useEffect(() => {
    loadChartData();
    loadWeeklySummary();
  }, [currentWeekDemurrage]);

  const loadWeeklySummary = async () => {
    try {
      const response = await api.getWeeklySummary();
      if (response.success && response.data) {
        setWeeklySummary(response.data);
      }
    } catch (error) {
      console.error('Error loading weekly summary:', error);
    }
  };

  const loadChartData = async () => {
    try {
      if (!currentWeekDemurrage) return;
      
      const events = await getStopEventsByWeek(currentWeekDemurrage.weekStartDate);
      const dailyMinutes = [0, 0, 0, 0, 0, 0, 0]; // Sun - Sat
      
      events.forEach(event => {
        if (event.isDemurrage) {
          const date = new Date(event.startTime);
          const dayIndex = date.getDay(); // 0 = Sunday
          dailyMinutes[dayIndex] += event.durationMinutes;
        }
      });
      
      setChartData(dailyMinutes);
    } catch (error) {
      console.error('Error loading chart data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllData();
    await loadWeeklySummary();
    await loadChartData();
    setRefreshing(false);
  }, []);

  const getStatusColor = () => {
    if (!isTracking) return theme.colors.outline;
    if (motionState.isMoving) return '#4CAF50'; // Green for moving
    if (currentStopEvent?.isDemurrage) return '#f44336'; // Red for demurrage
    return '#FF9800'; // Orange for stopped
  };

  const getStatusText = () => {
    if (!isTracking) return 'Not Tracking';
    if (motionState.isMoving) return 'Moving';
    if (currentStopEvent?.isDemurrage) return 'Demurrage';
    return 'Stopped';
  };

  const weekRange = currentWeekDemurrage 
    ? getWeekRangeDisplay(currentWeekDemurrage.weekStartDate)
    : 'This Week';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Driver Mode Button */}
      <Card style={[styles.card, styles.driverModeCard]}>
        <Card.Content>
          <View style={styles.driverModeContent}>
            <View style={styles.driverModeInfo}>
              <MaterialCommunityIcons name="truck" size={32} color="#4CAF50" />
              <View style={styles.driverModeText}>
                <Title style={styles.driverModeTitle}>Driver Mode</Title>
                <Paragraph style={styles.driverModeDesc}>
                  Start tracking with reason, photos & notes
                </Paragraph>
              </View>
            </View>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('DriverMode')}
              buttonColor="#4CAF50"
              icon="arrow-right"
              contentStyle={styles.driverModeButtonContent}
            >
              Open
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* Status Card */}
      <Card style={[styles.card, { borderLeftColor: getStatusColor(), borderLeftWidth: 5 }]}>
        <Card.Content>
          <View style={styles.statusHeader}>
            <View>
              <Text style={styles.statusLabel}>Current Status</Text>
              <Title style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Title>
            </View>
            <Surface style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} elevation={2}>
              <MaterialCommunityIcons
                name={isTracking ? (motionState.isMoving ? 'truck-fast' : 'truck') : 'truck-outline'}
                size={32}
                color="white"
              />
            </Surface>
          </View>
        </Card.Content>
      </Card>

      {/* Weekly Summary Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.weeklyHeader}>
            <Title>Weekly Demurrage</Title>
            <Chip icon="calendar">{weekRange}</Chip>
          </View>
          
          <View style={styles.summaryGrid}>
            <Surface style={styles.summaryItem} elevation={1}>
              <MaterialCommunityIcons name="clock-alert" size={32} color="#f44336" />
              <Text style={styles.summaryValue}>
                {formatMinutesToHHMM(currentWeekDemurrage?.totalDemurrageMinutes || 0)}
              </Text>
              <Text style={styles.summaryLabel}>Total Time</Text>
            </Surface>
            
            <Surface style={styles.summaryItem} elevation={1}>
              <MaterialCommunityIcons name="counter" size={32} color={theme.colors.primary} />
              <Text style={styles.summaryValue}>
                {currentWeekDemurrage?.eventCount || 0}
              </Text>
              <Text style={styles.summaryLabel}>Events</Text>
            </Surface>
            
            <Surface style={styles.summaryItem} elevation={1}>
              <MaterialCommunityIcons 
                name={currentWeekDemurrage?.invoiceSent ? 'check-circle' : 'file-document-outline'} 
                size={32} 
                color={currentWeekDemurrage?.invoiceSent ? '#4CAF50' : '#FF9800'} 
              />
              <Text style={styles.summaryValue}>
                {currentWeekDemurrage?.invoiceSent ? 'Sent' : 'Pending'}
              </Text>
              <Text style={styles.summaryLabel}>Invoice</Text>
            </Surface>
          </View>
        </Card.Content>
      </Card>

      {/* Weekly Chart */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Daily Demurrage (This Week)</Title>
          <BarChart
            data={{
              labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
              datasets: [{ data: chartData.map(m => m / 60) }], // Convert to hours
            }}
            width={screenWidth - 56}
            height={200}
            yAxisSuffix="h"
            yAxisLabel=""
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(244, 67, 54, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: { borderRadius: 16 },
              barPercentage: 0.6,
            }}
            style={styles.chart}
            showValuesOnTopOfBars
          />
        </Card.Content>
      </Card>

      {/* Company Info */}
      {company && (
        <Card style={[styles.card, { marginBottom: 24 }]}>
          <Card.Content>
            <View style={styles.companyInfo}>
              <MaterialCommunityIcons name="domain" size={24} color={theme.colors.primary} />
              <View style={styles.companyText}>
                <Text style={styles.companyName}>{company.name}</Text>
                {user && (
                  <Text style={styles.userName}>
                    {user.firstName} {user.lastName} ({user.role})
                  </Text>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 12,
    marginBottom: 0,
  },
  driverModeCard: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 5,
    borderLeftColor: '#4CAF50',
  },
  driverModeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  driverModeText: {
    flex: 1,
  },
  driverModeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 0,
  },
  driverModeDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 0,
  },
  driverModeButtonContent: {
    flexDirection: 'row-reverse',
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statusIndicator: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  chart: {
    marginTop: 12,
    borderRadius: 12,
  },
  companyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  companyText: {
    flex: 1,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 14,
    color: '#666',
  },
});
