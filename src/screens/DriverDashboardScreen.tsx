// Simplified Driver Dashboard - Start/Stop tracking with reason selection
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import {
  Card,
  Title,
  Text,
  Button,
  Surface,
  useTheme,
  Portal,
  Dialog,
  RadioButton,
  TextInput,
  IconButton,
  Chip,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../store/appStore';
import { getCurrentLocation } from '../services/location';
import { formatMinutesToHHMM } from '../utils/dateUtils';
import { StopReason, STOP_REASONS } from '../types';
import * as api from '../services/api';

export default function DriverDashboardScreen() {
  const theme = useTheme();
  const [isStarting, setIsStarting] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedReason, setSelectedReason] = useState<StopReason>('plant_breakdown');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const trackingStartTime = useRef<number | null>(null);
  
  const {
    isTracking,
    updateTrackingState,
    truckRego,
    trailerRego,
    user,
  } = useAppStore();

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Update elapsed time when tracking
  useEffect(() => {
    if (isTracking && activeEvent) {
      if (!trackingStartTime.current) {
        trackingStartTime.current = new Date(activeEvent.startTime).getTime();
      }
      
      const interval = setInterval(() => {
        if (trackingStartTime.current) {
          const elapsed = Math.floor((Date.now() - trackingStartTime.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      trackingStartTime.current = null;
      setElapsedSeconds(0);
      setPhotos([]);
      setNotes('');
    }
  }, [isTracking, activeEvent]);

  const loadData = async () => {
    try {
      // Check for active event
      const activeResponse = await api.getActiveEvent();
      if (activeResponse.success && activeResponse.data) {
        setActiveEvent(activeResponse.data);
        updateTrackingState({
          isTracking: true,
          currentStopEvent: activeResponse.data,
          motionState: { isMoving: false, speed: 0, lastUpdate: Date.now() },
        });
        if (activeResponse.data.reason) {
          setSelectedReason(activeResponse.data.reason);
        }
      }
      
      // Get weekly summary
      const weeklyResponse = await api.getWeeklySummary();
      if (weeklyResponse.success && weeklyResponse.data) {
        setWeeklySummary(weeklyResponse.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Format elapsed time as HH:MM:SS
  const formatElapsedTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStartTracking = () => {
    setShowReasonDialog(true);
  };

  const handleConfirmStart = async () => {
    setShowReasonDialog(false);
    setIsStarting(true);
    try {
      // Get current location
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
      // Get current location
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
        updateTrackingState({
          isTracking: false,
          currentStopEvent: null,
          motionState: { isMoving: true, speed: 0, lastUpdate: Date.now() },
        });
        
        // Reload weekly summary
        const weeklyResponse = await api.getWeeklySummary();
        if (weeklyResponse.success && weeklyResponse.data) {
          setWeeklySummary(weeklyResponse.data);
        }
        
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Vehicle Info Card */}
      {(truckRego || trailerRego) && (
        <Card style={styles.vehicleCard}>
          <Card.Content style={styles.vehicleContent}>
            <View style={styles.vehicleInfo}>
              <MaterialCommunityIcons name="truck" size={24} color={theme.colors.primary} />
              <Text style={styles.vehicleLabel}>Truck:</Text>
              <Chip style={styles.regoChip}>{truckRego || 'Not Set'}</Chip>
            </View>
            {trailerRego && (
              <View style={styles.vehicleInfo}>
                <MaterialCommunityIcons name="truck-trailer" size={24} color={theme.colors.primary} />
                <Text style={styles.vehicleLabel}>Trailer:</Text>
                <Chip style={styles.regoChip}>{trailerRego}</Chip>
              </View>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Main Tracking Card */}
      <Card style={styles.mainCard}>
        <Card.Content style={styles.mainContent}>
          {/* Status Indicator */}
          <Surface 
            style={[
              styles.statusCircle, 
              { backgroundColor: isTracking ? '#f44336' : '#4CAF50' }
            ]} 
            elevation={4}
          >
            <MaterialCommunityIcons
              name={isTracking ? 'stop' : 'play'}
              size={64}
              color="white"
            />
          </Surface>

          {/* Status Text */}
          <Title style={styles.statusText}>
            {isTracking ? 'Tracking Active' : 'Ready to Track'}
          </Title>

          {/* Elapsed Time (when tracking) */}
          {isTracking && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerLabel}>Current Session</Text>
              <Text style={styles.timerValue}>{formatElapsedTime(elapsedSeconds)}</Text>
              <Text style={styles.reasonBadge}>
                {getReasonLabel(selectedReason)}
              </Text>
            </View>
          )}

          {/* Start/Stop Button */}
          <Button
            mode="contained"
            onPress={isTracking ? handleStopTracking : handleStartTracking}
            loading={isStarting}
            disabled={isStarting}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            labelStyle={styles.actionButtonLabel}
            buttonColor={isTracking ? '#f44336' : '#4CAF50'}
          >
            {isTracking ? 'STOP TRACKING' : 'START TRACKING'}
          </Button>
        </Card.Content>
      </Card>

      {/* Photos & Notes Card (when tracking) */}
      {isTracking && (
        <Card style={styles.photosCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Add Evidence</Title>
            
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

      {/* Weekly Total Card */}
      <Card style={styles.totalCard}>
        <Card.Content>
          <View style={styles.totalHeader}>
            <MaterialCommunityIcons name="clock-alert" size={28} color="#f44336" />
            <Text style={styles.totalLabel}>Weekly Demurrage Total</Text>
          </View>
          <Text style={styles.totalValue}>
            {formatMinutesToHHMM(weeklySummary?.totalMinutes || 0)}
          </Text>
          <Text style={styles.totalEvents}>
            {weeklySummary?.eventCount || 0} events this week
          </Text>
        </Card.Content>
      </Card>

      {/* User Info */}
      {user && (
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            Logged in as: {user.firstName} {user.lastName}
          </Text>
        </View>
      )}

      {/* Reason Selection Dialog */}
      <Portal>
        <Dialog visible={showReasonDialog} onDismiss={() => setShowReasonDialog(false)}>
          <Dialog.Title>Select Stop Reason</Dialog.Title>
          <Dialog.Content>
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
          </Dialog.Content>
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
  scrollContent: {
    padding: 16,
  },
  vehicleCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  vehicleContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleLabel: {
    fontSize: 14,
    color: '#666',
  },
  regoChip: {
    backgroundColor: '#e3f2fd',
  },
  mainCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  mainContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  statusCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  timerLabel: {
    fontSize: 14,
    color: '#666',
  },
  timerValue: {
    fontSize: 48,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
    color: '#f44336',
  },
  reasonBadge: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
    overflow: 'hidden',
  },
  actionButton: {
    width: '100%',
    borderRadius: 12,
  },
  actionButtonContent: {
    height: 64,
  },
  actionButtonLabel: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  totalCard: {
    borderRadius: 16,
    marginBottom: 16,
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 16,
    color: '#666',
  },
  totalValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginVertical: 8,
  },
  totalEvents: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  radioItem: {
    paddingVertical: 4,
  },
  photosCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
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
  userInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  userName: {
    fontSize: 12,
    color: '#888',
  },
});
