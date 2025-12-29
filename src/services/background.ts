// Background task service for continuous tracking
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import { forceCheckMotionState } from './motion';
import {
  getCurrentStopEvent,
  updateStopEvent,
  saveStopEvent,
  getSettings,
  recalculateWeeklyDemurrage,
} from './database';
import { getCurrentLocation } from './location';
import { generateSecureId } from '../utils/encryption';
import {
  getWeekStartISO,
  calculateDurationMinutes,
  isDemurrageEvent,
  getCurrentTimestamp,
  shouldGenerateWeeklyInvoice,
} from '../utils/dateUtils';
import { generateWeeklyInvoice } from './invoice';

const BACKGROUND_LOCATION_TASK = 'DEMURRAGE_BACKGROUND_LOCATION';
const BACKGROUND_FETCH_TASK = 'DEMURRAGE_BACKGROUND_FETCH';

// Speed threshold for movement detection (m/s)
const SPEED_THRESHOLD = 1.5;

// Track state between background executions
let wasMoving = true;

/**
 * Define the background location task
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    
    if (locations && locations.length > 0) {
      const location = locations[locations.length - 1];
      const speed = location.coords.speed || 0;
      const isMoving = speed > SPEED_THRESHOLD;
      
      try {
        await handleBackgroundMotionUpdate(isMoving, location);
      } catch (e) {
        console.error('Error handling background motion:', e);
      }
    }
  }
});

/**
 * Define the background fetch task for periodic checks
 */
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    console.log('Background fetch task running');
    
    // Check if we need to generate weekly invoice
    if (shouldGenerateWeeklyInvoice()) {
      const settings = await getSettings();
      if (settings?.autoSendInvoice) {
        await generateWeeklyInvoice();
        console.log('Weekly invoice generated in background');
      }
    }
    
    // Check motion state
    const motionState = await forceCheckMotionState();
    
    // Get current location for update
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    
    await handleBackgroundMotionUpdate(motionState.isMoving, location);
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background fetch error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Handle motion updates from background tasks
 */
async function handleBackgroundMotionUpdate(
  isMoving: boolean,
  location: Location.LocationObject
): Promise<void> {
  const currentStop = await getCurrentStopEvent();
  const now = getCurrentTimestamp();
  
  if (!isMoving && !currentStop) {
    // Started stopping - create new stop event
    const newStop = {
      id: generateSecureId(),
      startTime: now,
      endTime: null,
      startLocation: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      endLocation: null,
      durationMinutes: 0,
      isDemurrage: false,
      weekStartDate: getWeekStartISO(),
      synced: false,
    };
    
    await saveStopEvent(newStop);
    wasMoving = false;
    console.log('Background: Stop event started');
  } else if (isMoving && currentStop) {
    // Started moving - end stop event
    const settings = await getSettings();
    const thresholdMinutes = settings?.demurrageThresholdMinutes || 50;
    const durationMinutes = calculateDurationMinutes(currentStop.startTime, now);
    
    currentStop.endTime = now;
    currentStop.endLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
    currentStop.durationMinutes = durationMinutes;
    currentStop.isDemurrage = isDemurrageEvent(durationMinutes, thresholdMinutes);
    
    await updateStopEvent(currentStop);
    
    if (currentStop.isDemurrage) {
      await recalculateWeeklyDemurrage(currentStop.weekStartDate);
    }
    
    wasMoving = true;
    console.log(`Background: Stop event ended - ${durationMinutes} min`);
  } else if (!isMoving && currentStop) {
    // Still stopped - update duration
    const settings = await getSettings();
    const thresholdMinutes = settings?.demurrageThresholdMinutes || 50;
    const durationMinutes = calculateDurationMinutes(currentStop.startTime, now);
    
    currentStop.durationMinutes = durationMinutes;
    currentStop.isDemurrage = isDemurrageEvent(durationMinutes, thresholdMinutes);
    
    await updateStopEvent(currentStop);
    
    if (currentStop.isDemurrage) {
      await recalculateWeeklyDemurrage(currentStop.weekStartDate);
    }
  }
}

/**
 * Start background location tracking
 */
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    // Check permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied');
      return false;
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000, // 30 seconds
      distanceInterval: 50, // 50 meters
      deferredUpdatesInterval: 60000, // 1 minute
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Demurrage Tracker',
        notificationBody: 'Tracking your stops in the background',
        notificationColor: '#2196F3',
      },
      pausesUpdatesAutomatically: false,
    });

    console.log('Background location tracking started');
    return true;
  } catch (error) {
    console.error('Error starting background tracking:', error);
    return false;
  }
}

/**
 * Stop background location tracking
 */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('Background location tracking stopped');
    }
  } catch (error) {
    console.error('Error stopping background tracking:', error);
  }
}

/**
 * Register background fetch for periodic tasks
 */
export async function registerBackgroundFetch(): Promise<boolean> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('Background fetch registered');
    return true;
  } catch (error) {
    console.error('Error registering background fetch:', error);
    return false;
  }
}

/**
 * Unregister background fetch
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    console.log('Background fetch unregistered');
  } catch (error) {
    console.error('Error unregistering background fetch:', error);
  }
}

/**
 * Check if background tracking is running
 */
export async function isBackgroundTrackingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    return false;
  }
}

/**
 * Get background fetch status
 */
export async function getBackgroundFetchStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  return await BackgroundFetch.getStatusAsync();
}
