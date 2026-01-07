// Deadhead Travel Tracking Screen
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, Card, Title, Divider, Chip, ActivityIndicator } from 'react-native-paper';
import * as Location from 'expo-location';
import * as api from '../services/api';

export default function DeadheadTravelScreen() {
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  
  // Trip state
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [activeBreak, setActiveBreak] = useState<any>(null);
  
  // Form state for starting trip
  const [truckRego, setTruckRego] = useState('');
  const [trailerRego, setTrailerRego] = useState('');
  const [startOdometer, setStartOdometer] = useState('');
  const [endOdometer, setEndOdometer] = useState('');
  
  // Motion detection
  const [isMoving, setIsMoving] = useState(false);
  const [stationaryTime, setStationaryTime] = useState(0);
  const locationSubscription = useRef<any>(null);
  const stationaryTimer = useRef<any>(null);
  const lastLocation = useRef<any>(null);

  useEffect(() => {
    requestPermissions();
    loadActiveTrip();
    
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (stationaryTimer.current) {
        clearInterval(stationaryTimer.current);
      }
    };
  }, []);

  const requestPermissions = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const loadActiveTrip = async () => {
    try {
      const response = await api.getActiveDeadheadTrip();
      if (response.success && response.data) {
        setActiveTrip(response.data.trip);
        setActiveBreak(response.data.activeBreak);
        
        if (response.data.trip) {
          startMotionDetection();
        }
      }
    } catch (error) {
      console.error('Error loading active trip:', error);
    }
  };

  const startMotionDetection = async () => {
    if (!hasPermission) return;

    // Watch location changes
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds
        distanceInterval: 50, // 50 meters
      },
      (location) => {
        handleLocationUpdate(location);
      }
    );
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    if (!lastLocation.current) {
      lastLocation.current = location;
      return;
    }

    // Calculate distance moved
    const distance = getDistance(
      lastLocation.current.coords.latitude,
      lastLocation.current.coords.longitude,
      location.coords.latitude,
      location.coords.longitude
    );

    // If moved more than 20 meters, consider it moving
    if (distance > 20) {
      handleMovement();
    } else {
      handleStationary();
    }

    lastLocation.current = location;
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const handleMovement = () => {
    setIsMoving(true);
    setStationaryTime(0);
    
    if (stationaryTimer.current) {
      clearInterval(stationaryTimer.current);
      stationaryTimer.current = null;
    }

    // If there's an active break, end it
    if (activeBreak && !activeBreak.endTime) {
      endBreakAuto();
    }
  };

  const handleStationary = () => {
    setIsMoving(false);

    // Start counting stationary time
    if (!stationaryTimer.current) {
      stationaryTimer.current = setInterval(() => {
        setStationaryTime((prev) => {
          const newTime = prev + 1;
          
          // Auto-start break after 2 minutes (120 seconds)
          if (newTime === 120 && !activeBreak) {
            startBreakAuto();
          }
          
          return newTime;
        });
      }, 1000);
    }
  };

  const startBreakAuto = async () => {
    if (!activeTrip || activeBreak) return;

    try {
      const location = await Location.getCurrentPositionAsync({});
      const address = await getAddressFromCoords(location.coords.latitude, location.coords.longitude);

      const response = await api.startDeadheadBreak({
        tripId: activeTrip.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
      });

      if (response.success) {
        setActiveBreak(response.data);
      }
    } catch (error) {
      console.error('Error starting break:', error);
    }
  };

  const endBreakAuto = async () => {
    if (!activeBreak) return;

    try {
      const location = await Location.getCurrentPositionAsync({});
      const address = await getAddressFromCoords(location.coords.latitude, location.coords.longitude);

      const response = await api.endDeadheadBreak({
        breakId: activeBreak.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
      });

      if (response.success) {
        setActiveBreak(null);
        loadActiveTrip(); // Reload to get updated trip with break data
      }
    } catch (error) {
      console.error('Error ending break:', error);
    }
  };

  const getAddressFromCoords = async (latitude: number, longitude: number): Promise<string | undefined> => {
    try {
      const result = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result.length > 0) {
        const addr = result[0];
        return `${addr.street}, ${addr.city}, ${addr.region}`;
      }
    } catch (error) {
      console.error('Error getting address:', error);
    }
    return undefined;
  };

  const handleStartTrip = async () => {
    if (!truckRego || !startOdometer) {
      Alert.alert('Error', 'Please enter truck rego and starting odometer');
      return;
    }

    if (!hasPermission) {
      Alert.alert('Permission Required', 'Location permission is required to track trips');
      return;
    }

    setLoading(true);

    try {
      const location = await Location.getCurrentPositionAsync({});
      const address = await getAddressFromCoords(location.coords.latitude, location.coords.longitude);

      const response = await api.startDeadheadTrip({
        truckRego,
        trailerRego: trailerRego || undefined,
        startOdometer: parseInt(startOdometer),
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
      });

      if (response.success) {
        setActiveTrip(response.data);
        setTruckRego('');
        setTrailerRego('');
        setStartOdometer('');
        startMotionDetection();
        Alert.alert('Success', 'Trip started successfully!');
      } else {
        Alert.alert('Error', response.error || 'Failed to start trip');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start trip');
    } finally {
      setLoading(false);
    }
  };

  const handleEndTrip = async () => {
    if (!endOdometer) {
      Alert.alert('Error', 'Please enter ending odometer reading');
      return;
    }

    Alert.alert(
      'End Trip',
      'Are you sure you want to end this trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Trip',
          onPress: async () => {
            setLoading(true);

            try {
              const location = await Location.getCurrentPositionAsync({});
              const address = await getAddressFromCoords(location.coords.latitude, location.coords.longitude);

              const response = await api.endDeadheadTrip({
                tripId: activeTrip.id,
                endOdometer: parseInt(endOdometer),
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                address,
              });

              if (response.success) {
                setActiveTrip(null);
                setActiveBreak(null);
                setEndOdometer('');
                setStationaryTime(0);
                
                if (locationSubscription.current) {
                  locationSubscription.current.remove();
                  locationSubscription.current = null;
                }
                
                if (stationaryTimer.current) {
                  clearInterval(stationaryTimer.current);
                  stationaryTimer.current = null;
                }

                Alert.alert('Success', 'Trip completed successfully!');
              } else {
                Alert.alert('Error', response.error || 'Failed to end trip');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to end trip');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.container}>
      {!activeTrip ? (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Start Deadhead Trip</Title>
            <TextInput
              label="Truck Rego *"
              value={truckRego}
              onChangeText={setTruckRego}
              mode="outlined"
              style={styles.input}
              autoCapitalize="characters"
            />
            <TextInput
              label="Trailer Rego (Optional)"
              value={trailerRego}
              onChangeText={setTrailerRego}
              mode="outlined"
              style={styles.input}
              autoCapitalize="characters"
            />
            <TextInput
              label="Starting Odometer (km) *"
              value={startOdometer}
              onChangeText={setStartOdometer}
              mode="outlined"
              style={styles.input}
              keyboardType="numeric"
            />
            <Button
              mode="contained"
              onPress={handleStartTrip}
              loading={loading}
              disabled={loading}
              style={styles.button}
              icon="play"
            >
              Start Trip
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <Card.Content>
              <Title>Active Trip</Title>
              <Divider style={styles.divider} />
              
              <View style={styles.row}>
                <Text style={styles.label}>Truck:</Text>
                <Text style={styles.value}>{activeTrip.truckRego}</Text>
              </View>
              
              {activeTrip.trailerRego && (
                <View style={styles.row}>
                  <Text style={styles.label}>Trailer:</Text>
                  <Text style={styles.value}>{activeTrip.trailerRego}</Text>
                </View>
              )}
              
              <View style={styles.row}>
                <Text style={styles.label}>Start Odometer:</Text>
                <Text style={styles.value}>{activeTrip.startOdometer} km</Text>
              </View>
              
              <View style={styles.row}>
                <Text style={styles.label}>Status:</Text>
                <Chip 
                  mode="flat" 
                  style={[styles.chip, isMoving ? styles.movingChip : styles.stationaryChip]}
                >
                  {isMoving ? 'Moving' : 'Stationary'}
                </Chip>
              </View>

              {!isMoving && stationaryTime > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>Stationary Time:</Text>
                  <Text style={styles.value}>{formatTime(stationaryTime)}</Text>
                </View>
              )}

              {activeBreak && (
                <View style={styles.breakInfo}>
                  <Text style={styles.breakText}>🛑 Break in Progress</Text>
                  <Text style={styles.breakSubtext}>
                    Started: {new Date(activeBreak.startTime).toLocaleTimeString()}
                  </Text>
                </View>
              )}

              {activeTrip.breaks && activeTrip.breaks.length > 0 && (
                <View style={styles.breaksSection}>
                  <Text style={styles.breaksTitle}>Breaks Taken: {activeTrip.breaks.length}</Text>
                  <Text style={styles.breaksSubtext}>
                    Total Break Time: {formatDuration(activeTrip.totalBreakMinutes)}
                  </Text>
                </View>
              )}

              <Divider style={styles.divider} />

              <TextInput
                label="Ending Odometer (km) *"
                value={endOdometer}
                onChangeText={setEndOdometer}
                mode="outlined"
                style={styles.input}
                keyboardType="numeric"
              />

              <Button
                mode="contained"
                onPress={handleEndTrip}
                loading={loading}
                disabled={loading}
                style={[styles.button, styles.endButton]}
                icon="stop"
                buttonColor="#f44336"
              >
                End Trip
              </Button>
            </Card.Content>
          </Card>
        </>
      )}

      {!hasPermission && (
        <Card style={[styles.card, styles.warningCard]}>
          <Card.Content>
            <Text style={styles.warningText}>
              ⚠️ Location permission is required to track deadhead trips
            </Text>
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
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  endButton: {
    marginTop: 16,
  },
  divider: {
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    color: '#666',
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  chip: {
    alignSelf: 'flex-start',
  },
  movingChip: {
    backgroundColor: '#4CAF50',
  },
  stationaryChip: {
    backgroundColor: '#FFC107',
  },
  breakInfo: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
  },
  breakText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  breakSubtext: {
    fontSize: 14,
    color: '#856404',
    marginTop: 4,
  },
  breaksSection: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
  },
  breaksTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  breaksSubtext: {
    fontSize: 14,
    color: '#1976d2',
    marginTop: 4,
  },
  warningCard: {
    backgroundColor: '#fff3cd',
  },
  warningText: {
    color: '#856404',
    fontSize: 16,
    textAlign: 'center',
  },
});
