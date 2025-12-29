// Dashboard screen - Main tracking view
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Text,
  Surface,
  useTheme,
  ActivityIndicator,
  Chip,
  ProgressBar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useAppStore } from '../store/appStore';
import { startTracking, stopTracking, getTrackingState } from '../services/tracking';
import { startBackgroundTracking, stopBackgroundTracking } from '../services/background';
import { formatDuration, formatDateTime, getWeekRangeDisplay, formatMinutesToHHMM } from '../utils/dateUtils';
import { formatLocation, getCurrentLocation } from '../services/location';
import { getStopEventsByWeek } from '../services/database';
import * as api from '../services/api';

export default function DashboardScreen() {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chartData, setChartData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const trackingStartTime = useRef<number | null>(null);
  const screenWidth = Dimensions.get('window').width;
  
  const {
    isTracking,
    currentStopEvent,
    motionState,
    currentWeekDemurrage,
    settings,
    updateTrackingState,
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

  // Set up tracking state updates and elapsed time counter
  useEffect(() => {
    if (isTracking) {
      // Set start time if not already set
      if (!trackingStartTime.current) {
        trackingStartTime.current = Date.now();
      }
      
      const interval = setInterval(() => {
        updateTrackingState(getTrackingState());
        // Update elapsed time
        if (trackingStartTime.current) {
          const elapsed = Math.floor((Date.now() - trackingStartTime.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      // Reset when tracking stops
      trackingStartTime.current = null;
      setElapsedSeconds(0);
      // Refresh data when tracking stops to show updated totals
      refreshAllData();
    }
  }, [isTracking]);

  // Format elapsed time as HH:MM:SS
  const formatElapsedTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllData();
    setRefreshing(false);
  }, []);

  const handleToggleTracking = async () => {
    setIsStarting(true);
    try {
      if (isTracking) {
        await stopTracking();
        await stopBackgroundTracking();
      } else {
        await startTracking(updateTrackingState);
        await startBackgroundTracking();
      }
    } catch (error) {
      console.error('Error toggling tracking:', error);
    }
    setIsStarting(false);
  };

  const getDemurrageProgress = () => {
    if (!currentStopEvent) return 0;
    const threshold = settings?.demurrageThresholdMinutes || 50;
    return Math.min(currentStopEvent.durationMinutes / threshold, 1);
  };

  const getStatusColor = () => {
    if (!isTracking) return theme.colors.outline;
    if (motionState.isMoving) return '#4CAF50'; // Green for moving
    if (currentStopEvent?.isDemurrage) return '#f44336'; // Red for demurrage
    return '#FF9800'; // Orange for stopped
  };

  const getStatusText = () => {
    if (!isTracking) return 'Tracking Off';
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
                name={motionState.isMoving ? 'truck-fast' : 'truck'}
                size={32}
                color="white"
              />
            </Surface>
          </View>
          
          {isTracking && (
            <View style={styles.speedInfo}>
              <MaterialCommunityIcons name="speedometer" size={20} color={theme.colors.primary} />
              <Text style={styles.speedText}>
                {(motionState.speed * 3.6).toFixed(1)} km/h
              </Text>
            </View>
          )}
          
          {/* Elapsed Time Counter */}
          {isTracking && (
            <View style={styles.elapsedTimeContainer}>
              <MaterialCommunityIcons name="timer-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.elapsedTimeLabel}>Tracking Time:</Text>
              <Text style={styles.elapsedTimeValue}>{formatElapsedTime(elapsedSeconds)}</Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Current Stop Card */}
      {currentStopEvent && !motionState.isMoving && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Current Stop</Title>
            <View style={styles.stopDetails}>
              <View style={styles.stopRow}>
                <MaterialCommunityIcons name="clock-start" size={20} color={theme.colors.primary} />
                <Text style={styles.stopText}>
                  Started: {formatDateTime(currentStopEvent.startTime)}
                </Text>
              </View>
              <View style={styles.stopRow}>
                <MaterialCommunityIcons name="timer" size={20} color={theme.colors.primary} />
                <Text style={styles.stopText}>
                  Duration: {formatDuration(currentStopEvent.durationMinutes)}
                </Text>
              </View>
              <View style={styles.stopRow}>
                <MaterialCommunityIcons name="map-marker" size={20} color={theme.colors.primary} />
                <Text style={styles.stopText} numberOfLines={2}>
                  {formatLocation(currentStopEvent.startLocation)}
                </Text>
              </View>
            </View>
            
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>
                {currentStopEvent.isDemurrage 
                  ? 'Demurrage threshold exceeded!'
                  : `${settings?.demurrageThresholdMinutes || 50 - currentStopEvent.durationMinutes} min until demurrage`
                }
              </Text>
              <ProgressBar
                progress={getDemurrageProgress()}
                color={currentStopEvent.isDemurrage ? '#f44336' : '#FF9800'}
                style={styles.progressBar}
              />
            </View>
          </Card.Content>
        </Card>
      )}

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

      {/* Tracking Control */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Tracking Control</Title>
          <Paragraph>
            {isTracking 
              ? 'Tracking is active. The app is monitoring your movement in the background.'
              : 'Start tracking to automatically detect stops and calculate demurrage.'
            }
          </Paragraph>
          <Button
            mode="contained"
            onPress={handleToggleTracking}
            loading={isStarting}
            disabled={isStarting}
            style={styles.trackingButton}
            icon={isTracking ? 'stop' : 'play'}
            buttonColor={isTracking ? '#f44336' : '#4CAF50'}
          >
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </Button>
        </Card.Content>
      </Card>
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
  speedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  speedText: {
    fontSize: 16,
  },
  stopDetails: {
    marginTop: 12,
    gap: 8,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stopText: {
    fontSize: 14,
    flex: 1,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
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
  trackingButton: {
    marginTop: 16,
  },
  elapsedTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    gap: 8,
  },
  elapsedTimeLabel: {
    fontSize: 14,
    color: '#666',
  },
  elapsedTimeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    fontVariant: ['tabular-nums'],
  },
  chart: {
    marginTop: 12,
    borderRadius: 12,
  },
});
