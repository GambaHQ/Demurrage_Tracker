// Dashboard screen - Main tracking view
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions, Image, Alert } from 'react-native';
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
  Portal,
  Dialog,
  RadioButton,
  TextInput,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../store/appStore';
import { startBackgroundTracking, stopBackgroundTracking } from '../services/background';
import { formatDuration, formatDateTime, getWeekRangeDisplay, formatMinutesToHHMM } from '../utils/dateUtils';
import { formatLocation, getCurrentLocation } from '../services/location';
import { getStopEventsByWeek } from '../services/database';
import { StopReason, STOP_REASONS } from '../types';
import * as api from '../services/api';

export default function DashboardScreen() {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chartData, setChartData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const trackingStartTime = useRef<number | null>(null);
  const screenWidth = Dimensions.get('window').width;
  
  // Reason selection and evidence state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedReason, setSelectedReason] = useState<StopReason>('plant_breakdown');
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  
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
    loadActiveEvent();
  }, [currentWeekDemurrage]);

  const loadActiveEvent = async () => {
    try {
      const response = await api.getActiveEvent();
      if (response.success && response.data) {
        setActiveEvent(response.data);
        updateTrackingState({
          isTracking: true,
          currentStopEvent: response.data,
          motionState: { isMoving: false, speed: 0, lastUpdate: Date.now() },
        });
        if (response.data.reason) {
          setSelectedReason(response.data.reason);
        }
      }
    } catch (error) {
      console.error('Error loading active event:', error);
    }
  };

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
    if (isTracking && activeEvent) {
      // Set start time from active event
      if (!trackingStartTime.current) {
        trackingStartTime.current = new Date(activeEvent.startTime).getTime();
      }
      
      const interval = setInterval(() => {
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
  }, [isTracking, activeEvent]);

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

  const handleStartTracking = () => {
    setShowReasonDialog(true);
  };

  const handleConfirmStart = async () => {
    setShowReasonDialog(false);
    setIsStarting(true);
    try {
      const location = await getCurrentLocation();
      if (!location) {
        Alert.alert('Error', 'Could not get current location. Please enable location services.');
        setIsStarting(false);
        return;
      }

      const response = await api.startTracking({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        reason: selectedReason,
      });

      if (response.success && response.data) {
        setActiveEvent(response.data);
        updateTrackingState({
          isTracking: true,
          currentStopEvent: response.data,
          motionState: { isMoving: false, speed: 0, lastUpdate: Date.now() },
        });
        await startBackgroundTracking();
      } else {
        Alert.alert('Error', response.error || 'Failed to start tracking');
      }
    } catch (error: any) {
      console.error('Error starting tracking:', error);
      Alert.alert('Error', error.message || 'Failed to start tracking');
    }
    setIsStarting(false);
  };

  const handleStopTracking = async () => {
    setIsStarting(true);
    try {
      const location = await getCurrentLocation();
      if (!location) {
        Alert.alert('Error', 'Could not get current location');
        setIsStarting(false);
        return;
      }

      // Update photos/notes if any
      if (activeEvent && (photos.length > 0 || notes)) {
        await api.updateStopEvent(activeEvent.id, { notes, photos });
      }

      const response = await api.endTracking({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });

      if (response.success) {
        setActiveEvent(null);
        setPhotos([]);
        setNotes('');
        updateTrackingState({
          isTracking: false,
          currentStopEvent: null,
          motionState: { isMoving: true, speed: 0, lastUpdate: Date.now() },
        });
        await stopBackgroundTracking();
        loadWeeklySummary();
        loadChartData();

        if (response.data?.isDemurrage) {
          Alert.alert(
            'Demurrage Recorded',
            `This stop (${Math.round(response.data.durationMinutes)} min) has been recorded as demurrage.`
          );
        }
      } else {
        Alert.alert('Error', response.error || 'Failed to stop tracking');
      }
    } catch (error: any) {
      console.error('Error stopping tracking:', error);
      Alert.alert('Error', error.message || 'Failed to stop tracking');
    }
    setIsStarting(false);
  };

  const getReasonLabel = (reason: StopReason): string => {
    return STOP_REASONS.find(r => r.value === reason)?.label || reason;
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is needed');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert('Error', 'Failed to select photo');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
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
          
          {isTracking && activeEvent && (
            <View style={styles.reasonContainer}>
              <Chip icon="tag" style={styles.reasonChip}>
                {getReasonLabel(selectedReason)}
              </Chip>
            </View>
          )}
          
          <Button
            mode="contained"
            onPress={isTracking ? handleStopTracking : handleStartTracking}
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

      {/* Photos & Notes Card (when tracking) */}
      {isTracking && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Add Evidence</Title>
            
            {/* Photo Buttons */}
            <View style={styles.photoButtons}>
              <Button
                mode="outlined"
                onPress={handleTakePhoto}
                icon="camera"
                style={styles.photoButton}
              >
                Take Photo
              </Button>
              <Button
                mode="outlined"
                onPress={handlePickPhoto}
                icon="image"
                style={styles.photoButton}
              >
                Gallery
              </Button>
            </View>
            
            {/* Photo Thumbnails */}
            {photos.length > 0 && (
              <ScrollView horizontal style={styles.photoScroll}>
                {photos.map((uri, index) => (
                  <View key={index} style={styles.photoContainer}>
                    <Image source={{ uri }} style={styles.photoThumbnail} />
                    <IconButton
                      icon="close-circle"
                      size={20}
                      onPress={() => handleRemovePhoto(index)}
                      style={styles.removePhotoButton}
                    />
                  </View>
                ))}
              </ScrollView>
            )}
            
            {/* Notes */}
            <Button
              mode="outlined"
              onPress={() => setShowNotesDialog(true)}
              icon="note-text"
              style={styles.notesButton}
            >
              {notes ? 'Edit Notes' : 'Add Notes'}
            </Button>
            
            {notes && (
              <Text style={styles.notesPreview} numberOfLines={2}>
                {notes}
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Reason Selection Dialog */}
      <Portal>
        <Dialog visible={showReasonDialog} onDismiss={() => setShowReasonDialog(false)}>
          <Dialog.Title>Select Stop Reason</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <RadioButton.Group
                onValueChange={(value) => setSelectedReason(value as StopReason)}
                value={selectedReason}
              >
                {STOP_REASONS.map((reason) => (
                  <RadioButton.Item
                    key={reason.value}
                    label={reason.label}
                    value={reason.value}
                    style={styles.radioItem}
                  />
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowReasonDialog(false)}>Cancel</Button>
            <Button onPress={handleConfirmStart} mode="contained">
              Start Tracking
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Notes Dialog */}
      <Portal>
        <Dialog visible={showNotesDialog} onDismiss={() => setShowNotesDialog(false)}>
          <Dialog.Title>Add Notes</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              multiline
              numberOfLines={4}
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter notes about this stop..."
              style={styles.notesInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowNotesDialog(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  reasonContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  reasonChip: {
    alignSelf: 'flex-start',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  photoButton: {
    flex: 1,
  },
  photoScroll: {
    marginBottom: 12,
  },
  photoContainer: {
    position: 'relative',
    marginRight: 8,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    margin: 0,
  },
  notesButton: {
    marginTop: 8,
  },
  notesPreview: {
    marginTop: 8,
    color: '#666',
    fontStyle: 'italic',
  },
  notesInput: {
    minHeight: 100,
  },
  radioItem: {
    paddingVertical: 4,
  },
  dialogScrollArea: {
    maxHeight: 300,
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
