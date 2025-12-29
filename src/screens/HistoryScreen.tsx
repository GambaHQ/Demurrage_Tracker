// History screen - View past stop events and weekly summaries
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import {
  Card,
  Title,
  Text,
  Chip,
  useTheme,
  SegmentedButtons,
  Surface,
  Divider,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { StopEvent, WeeklyDemurrage } from '../types';
import {
  formatDateTime,
  formatDuration,
  getWeekRangeDisplay,
  formatMinutesToHHMM,
} from '../utils/dateUtils';
import { formatLocation } from '../services/location';
import { getStopEventsByWeek } from '../services/database';
import * as api from '../services/api';

type ViewMode = 'events' | 'weeks';

export default function HistoryScreen() {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekEvents, setSelectedWeekEvents] = useState<StopEvent[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  
  const {
    recentStops,
    weeklyHistory,
    loadRecentStops,
    loadWeeklyHistory,
  } = useAppStore();
  const [apiEvents, setApiEvents] = useState<StopEvent[]>([]);
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  useEffect(() => {
    loadWeeklyHistory();
    loadApiEvents();
  }, []);

  const loadApiEvents = async () => {
    setIsLoadingApi(true);
    try {
      // Get events from last 30 days
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const response = await api.getStopEvents({ startDate, endDate });
      if (response.success && response.data) {
        setApiEvents(response.data);
      }
    } catch (error) {
      console.error('Error loading API events:', error);
    }
    setIsLoadingApi(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecentStops();
    await loadWeeklyHistory();
    await loadApiEvents();
    setRefreshing(false);
  }, []);

  const handleExpandWeek = async (weekStartDate: string) => {
    if (expandedWeek === weekStartDate) {
      setExpandedWeek(null);
      setSelectedWeekEvents([]);
    } else {
      setExpandedWeek(weekStartDate);
      const events = await getStopEventsByWeek(weekStartDate);
      setSelectedWeekEvents(events);
    }
  };

  const renderStopEvent = ({ item }: { item: StopEvent }) => (
    <Card style={[styles.eventCard, item.isDemurrage && styles.demurrageCard]}>
      <Card.Content>
        <View style={styles.eventHeader}>
          <View style={styles.eventTime}>
            <MaterialCommunityIcons
              name={item.isDemurrage ? 'clock-alert' : 'clock-outline'}
              size={24}
              color={item.isDemurrage ? '#f44336' : theme.colors.primary}
            />
            <View>
              <Text style={styles.eventTimeText}>
                {formatDateTime(item.startTime)}
              </Text>
              {item.endTime && (
                <Text style={styles.eventEndTime}>
                  to {formatDateTime(item.endTime)}
                </Text>
              )}
            </View>
          </View>
          <Chip
            mode={item.isDemurrage ? 'flat' : 'outlined'}
            style={item.isDemurrage ? styles.demurrageChip : undefined}
            textStyle={item.isDemurrage ? styles.demurrageChipText : undefined}
          >
            {formatDuration(item.durationMinutes)}
          </Chip>
        </View>
        
        <View style={styles.eventLocation}>
          <MaterialCommunityIcons name="map-marker" size={16} color="#666" />
          <Text style={styles.locationText} numberOfLines={1}>
            {formatLocation(item.startLocation)}
          </Text>
        </View>
        
        {item.isDemurrage && (
          <View style={styles.demurrageBadge}>
            <MaterialCommunityIcons name="alert" size={14} color="#f44336" />
            <Text style={styles.demurrageText}>Demurrage Event</Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const renderWeeklySummary = ({ item }: { item: WeeklyDemurrage }) => (
    <Card style={styles.weekCard}>
      <Card.Content>
        <View style={styles.weekHeader}>
          <View>
            <Text style={styles.weekRange}>
              {getWeekRangeDisplay(item.weekStartDate)}
            </Text>
            <View style={styles.weekStats}>
              <View style={styles.weekStat}>
                <MaterialCommunityIcons name="clock" size={16} color={theme.colors.primary} />
                <Text>{formatMinutesToHHMM(item.totalDemurrageMinutes)}</Text>
              </View>
              <View style={styles.weekStat}>
                <MaterialCommunityIcons name="counter" size={16} color={theme.colors.primary} />
                <Text>{item.eventCount} events</Text>
              </View>
            </View>
          </View>
          <View style={styles.weekActions}>
            {item.invoiceSent && (
              <Chip icon="check" mode="flat" style={styles.sentChip}>
                Sent
              </Chip>
            )}
            <IconButton
              icon={expandedWeek === item.weekStartDate ? 'chevron-up' : 'chevron-down'}
              onPress={() => handleExpandWeek(item.weekStartDate)}
            />
          </View>
        </View>
        
        {expandedWeek === item.weekStartDate && (
          <View style={styles.expandedContent}>
            <Divider style={styles.divider} />
            {selectedWeekEvents.length === 0 ? (
              <Text style={styles.noEventsText}>No stop events this week</Text>
            ) : (
              selectedWeekEvents.map((event) => (
                <Surface key={event.id} style={styles.miniEventCard} elevation={1}>
                  <View style={styles.miniEventRow}>
                    <MaterialCommunityIcons
                      name={event.isDemurrage ? 'clock-alert' : 'clock-outline'}
                      size={16}
                      color={event.isDemurrage ? '#f44336' : '#666'}
                    />
                    <Text style={styles.miniEventTime}>
                      {formatDateTime(event.startTime)}
                    </Text>
                    <Text style={[
                      styles.miniEventDuration,
                      event.isDemurrage && styles.demurrageDuration
                    ]}>
                      {formatDuration(event.durationMinutes)}
                    </Text>
                  </View>
                </Surface>
              ))
            )}
          </View>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={viewMode}
        onValueChange={(value) => setViewMode(value as ViewMode)}
        buttons={[
          { value: 'events', label: 'Recent Events', icon: 'clock-outline' },
          { value: 'weeks', label: 'Weekly Summary', icon: 'calendar' },
        ]}
        style={styles.segmentedButtons}
      />

      {viewMode === 'events' ? (
        <FlatList
          data={apiEvents.length > 0 ? apiEvents : recentStops}
          renderItem={renderStopEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="history" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No stop events yet</Text>
              <Text style={styles.emptySubtext}>
                Start tracking to record your stops
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={weeklyHistory}
          renderItem={renderWeeklySummary}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="calendar-blank" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No weekly data yet</Text>
              <Text style={styles.emptySubtext}>
                Weekly summaries will appear here
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  segmentedButtons: {
    margin: 12,
  },
  listContent: {
    padding: 12,
    paddingTop: 0,
  },
  eventCard: {
    marginBottom: 12,
  },
  demurrageCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  eventTimeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventEndTime: {
    fontSize: 14,
    color: '#666',
  },
  eventLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  demurrageChip: {
    backgroundColor: '#ffebee',
  },
  demurrageChipText: {
    color: '#f44336',
  },
  demurrageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  demurrageText: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: '600',
  },
  weekCard: {
    marginBottom: 12,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekRange: {
    fontSize: 16,
    fontWeight: '600',
  },
  weekStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  weekStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sentChip: {
    backgroundColor: '#e8f5e9',
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    marginBottom: 12,
  },
  noEventsText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
  miniEventCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  miniEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniEventTime: {
    flex: 1,
    fontSize: 14,
  },
  miniEventDuration: {
    fontSize: 14,
    fontWeight: '600',
  },
  demurrageDuration: {
    color: '#f44336',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
