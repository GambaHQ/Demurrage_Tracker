// Event Detail Screen - Shows full details of a stop event
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Dimensions, Modal, TouchableOpacity } from 'react-native';
import {
  Card,
  Title,
  Text,
  Chip,
  Surface,
  useTheme,
  Divider,
  Button,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { formatDateTime, formatDuration } from '../utils/dateUtils';
import { STOP_REASONS } from '../types';

const screenWidth = Dimensions.get('window').width;

export default function EventDetailScreen() {
  const theme = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const event = route.params?.event;
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <MaterialCommunityIcons name="alert-circle" size={64} color="#ccc" />
        <Text style={styles.errorText}>Event not found</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </View>
    );
  }

  const getReasonLabel = (reason: string): string => {
    return STOP_REASONS.find(r => r.value === reason)?.label || reason || 'Not specified';
  };

  const formatLocation = (location: any): string => {
    if (!location) return 'Unknown location';
    if (location.address) return location.address;
    return `${location.latitude?.toFixed(6)}, ${location.longitude?.toFixed(6)}`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status Header */}
      <Surface style={[styles.statusHeader, event.isDemurrage && styles.demurrageHeader]} elevation={2}>
        <View style={styles.statusContent}>
          <MaterialCommunityIcons 
            name={event.isDemurrage ? 'clock-alert' : 'clock-check'} 
            size={48} 
            color={event.isDemurrage ? '#f44336' : '#4CAF50'} 
          />
          <View style={styles.statusInfo}>
            <Text style={[styles.statusTitle, event.isDemurrage && styles.demurrageTitle]}>
              {event.isDemurrage ? 'Demurrage Event' : 'Stop Event'}
            </Text>
            <Text style={styles.statusDuration}>
              {formatDuration(event.durationMinutes)}
            </Text>
          </View>
        </View>
      </Surface>

      {/* User Info Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
            <Title style={styles.sectionTitle}>Created By</Title>
          </View>
          <Text style={styles.userName}>{event.userName || 'Unknown User'}</Text>
          {(event.truckRego || event.trailerRego) && (
            <View style={styles.vehicleInfo}>
              {event.truckRego && (
                <Chip icon="truck" style={styles.vehicleChip}>
                  Truck: {event.truckRego}
                </Chip>
              )}
              {event.trailerRego && (
                <Chip icon="truck-trailer" style={styles.vehicleChip}>
                  Trailer: {event.trailerRego}
                </Chip>
              )}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Time Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="clock-outline" size={24} color={theme.colors.primary} />
            <Title style={styles.sectionTitle}>Time</Title>
          </View>
          
          <View style={styles.timeRow}>
            <MaterialCommunityIcons name="clock-start" size={20} color="#666" />
            <View style={styles.timeInfo}>
              <Text style={styles.timeLabel}>Started</Text>
              <Text style={styles.timeValue}>{formatDateTime(event.startTime)}</Text>
            </View>
          </View>
          
          {event.endTime && (
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="clock-end" size={20} color="#666" />
              <View style={styles.timeInfo}>
                <Text style={styles.timeLabel}>Ended</Text>
                <Text style={styles.timeValue}>{formatDateTime(event.endTime)}</Text>
              </View>
            </View>
          )}
          
          <View style={styles.timeRow}>
            <MaterialCommunityIcons name="timer" size={20} color="#666" />
            <View style={styles.timeInfo}>
              <Text style={styles.timeLabel}>Duration</Text>
              <Text style={[styles.timeValue, event.isDemurrage && styles.demurrageText]}>
                {formatDuration(event.durationMinutes)}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Location Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="map-marker" size={24} color={theme.colors.primary} />
            <Title style={styles.sectionTitle}>Location</Title>
          </View>
          
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker-radius" size={20} color="#4CAF50" />
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Start Location</Text>
              <Text style={styles.locationValue}>{formatLocation(event.startLocation)}</Text>
            </View>
          </View>
          
          {event.endLocation && (
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-check" size={20} color="#f44336" />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>End Location</Text>
                <Text style={styles.locationValue}>{formatLocation(event.endLocation)}</Text>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Reason Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="tag" size={24} color={theme.colors.primary} />
            <Title style={styles.sectionTitle}>Stop Reason</Title>
          </View>
          <Chip icon="information" style={styles.reasonChip}>
            {getReasonLabel(event.reason)}
          </Chip>
        </Card.Content>
      </Card>

      {/* Notes Card */}
      {event.notes && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="note-text" size={24} color={theme.colors.primary} />
              <Title style={styles.sectionTitle}>Notes</Title>
            </View>
            <Text style={styles.notesText}>{event.notes}</Text>
          </Card.Content>
        </Card>
      )}

      {/* Photos Card */}
      {event.photos && event.photos.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="camera" size={24} color={theme.colors.primary} />
              <Title style={styles.sectionTitle}>Photos ({event.photos.length})</Title>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {event.photos.map((uri: string, index: number) => (
                <TouchableOpacity key={index} onPress={() => setSelectedPhoto(uri)}>
                  <Image source={{ uri }} style={styles.photoThumbnail} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card.Content>
        </Card>
      )}

      {/* No photos/notes indicator */}
      {!event.notes && (!event.photos || event.photos.length === 0) && (
        <Card style={styles.card}>
          <Card.Content style={styles.noEvidenceContent}>
            <MaterialCommunityIcons name="file-document-outline" size={32} color="#ccc" />
            <Text style={styles.noEvidenceText}>No notes or photos attached</Text>
          </Card.Content>
        </Card>
      )}

      {/* Photo Viewer Modal */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPhoto(null)}>
            <MaterialCommunityIcons name="close" size={32} color="white" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image 
              source={{ uri: selectedPhoto }} 
              style={styles.fullPhoto} 
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
  },
  statusHeader: {
    margin: 12,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  demurrageHeader: {
    backgroundColor: '#FFEBEE',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  demurrageTitle: {
    color: '#C62828',
  },
  statusDuration: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  card: {
    margin: 12,
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 0,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
  },
  vehicleInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  vehicleChip: {
    backgroundColor: '#e3f2fd',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  timeInfo: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#666',
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  demurrageText: {
    color: '#f44336',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#666',
  },
  locationValue: {
    fontSize: 14,
  },
  reasonChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  photoScroll: {
    marginTop: 8,
  },
  photoThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 12,
  },
  noEvidenceContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noEvidenceText: {
    color: '#999',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullPhoto: {
    width: screenWidth,
    height: screenWidth,
  },
  bottomPadding: {
    height: 24,
  },
});
