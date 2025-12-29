// Location tracking service using expo-location
import * as Location from 'expo-location';
import { Location as LocationType } from '../types';

let locationSubscription: Location.LocationSubscription | null = null;
let isWatchingLocation = false;

/**
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      return false;
    }
    
    // Request background permission for continuous tracking
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied - tracking will only work when app is open');
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
}

/**
 * Check if location permissions are granted
 */
export async function checkLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    return foregroundStatus === 'granted';
  } catch (error) {
    console.error('Error checking location permissions:', error);
    return false;
  }
}

/**
 * Get current location
 */
export async function getCurrentLocation(): Promise<LocationType | null> {
  try {
    const hasPermission = await checkLocationPermissions();
    if (!hasPermission) {
      const granted = await requestLocationPermissions();
      if (!granted) return null;
    }
    
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    
    const address = await getAddressFromCoordinates(
      location.coords.latitude,
      location.coords.longitude
    );
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      address: address || undefined,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
}

/**
 * Get address from coordinates (reverse geocoding)
 */
export async function getAddressFromCoordinates(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const addresses = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    
    if (addresses.length > 0) {
      const addr = addresses[0];
      const parts = [
        addr.streetNumber,
        addr.street,
        addr.city,
        addr.region,
        addr.postalCode,
      ].filter(Boolean);
      
      return parts.join(', ');
    }
    
    return null;
  } catch (error) {
    console.error('Error getting address:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Start watching location with a callback
 */
export async function startLocationWatch(
  callback: (location: Location.LocationObject) => void,
  options?: {
    distanceInterval?: number;
    timeInterval?: number;
  }
): Promise<boolean> {
  try {
    if (isWatchingLocation) {
      console.log('Already watching location');
      return true;
    }
    
    const hasPermission = await checkLocationPermissions();
    if (!hasPermission) {
      const granted = await requestLocationPermissions();
      if (!granted) return false;
    }
    
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: options?.distanceInterval || 10, // meters
        timeInterval: options?.timeInterval || 5000, // ms
      },
      callback
    );
    
    isWatchingLocation = true;
    console.log('Location watch started');
    return true;
  } catch (error) {
    console.error('Error starting location watch:', error);
    return false;
  }
}

/**
 * Stop watching location
 */
export function stopLocationWatch(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
    isWatchingLocation = false;
    console.log('Location watch stopped');
  }
}

/**
 * Get the last known location (faster than getting current location)
 */
export async function getLastKnownLocation(): Promise<LocationType | null> {
  try {
    const hasPermission = await checkLocationPermissions();
    if (!hasPermission) return null;
    
    const location = await Location.getLastKnownPositionAsync();
    
    if (!location) return null;
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting last known location:', error);
    return null;
  }
}

/**
 * Check if location services are enabled
 */
export async function isLocationServicesEnabled(): Promise<boolean> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
}

/**
 * Get current speed in m/s
 */
export async function getCurrentSpeed(): Promise<number> {
  try {
    const hasPermission = await checkLocationPermissions();
    if (!hasPermission) return 0;
    
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    
    return location.coords.speed || 0;
  } catch (error) {
    console.error('Error getting current speed:', error);
    return 0;
  }
}

/**
 * Format location for display
 */
export function formatLocation(location: LocationType): string {
  if (location.address) {
    return location.address;
  }
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}
