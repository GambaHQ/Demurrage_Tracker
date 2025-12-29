// Main tracking service that coordinates motion detection and event recording
import { StopEvent, MotionState, Location, TrackingState, StopReason } from '../types';
import { startMotionDetection, stopMotionDetection, getMotionState } from './motion';
import { getCurrentLocation } from './location';
import {
  saveStopEvent,
  updateStopEvent,
  getCurrentStopEvent,
  getSettings,
  getOrCreateWeeklyDemurrage,
  recalculateWeeklyDemurrage,
} from './database';
import { generateSecureId } from '../utils/encryption';
import { getWeekStartISO, calculateDurationMinutes, isDemurrageEvent, getCurrentTimestamp } from '../utils/dateUtils';

type TrackingStateCallback = (state: TrackingState) => void;

let isTracking = false;
let currentStopEvent: StopEvent | null = null;
let stateCallback: TrackingStateCallback | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;
let pendingReason: StopReason | null = null; // Reason to use for new stop events

// Configuration
const UPDATE_INTERVAL = 60000; // Update current stop event every minute

/**
 * Handle motion state changes
 */
async function handleMotionChange(isMoving: boolean, motionState: MotionState): Promise<void> {
  console.log(`Motion state changed: ${isMoving ? 'MOVING' : 'STOPPED'}`);
  
  if (!isMoving && !currentStopEvent) {
    // Vehicle has stopped - create new stop event
    await startStopEvent();
  } else if (isMoving && currentStopEvent) {
    // Vehicle has started moving - end current stop event
    await endStopEvent();
  }
  
  notifyStateChange(motionState);
}

/**
 * Start a new stop event
 */
async function startStopEvent(): Promise<void> {
  try {
    const location = await getCurrentLocation();
    const settings = await getSettings();
    const now = getCurrentTimestamp();
    
    currentStopEvent = {
      id: generateSecureId(),
      startTime: now,
      endTime: null,
      startLocation: location || { latitude: 0, longitude: 0 },
      endLocation: null,
      durationMinutes: 0,
      isDemurrage: false,
      weekStartDate: getWeekStartISO(),
      synced: false,
      reason: pendingReason || undefined, // Use the pending reason
    };
    
    await saveStopEvent(currentStopEvent);
    
    // Ensure weekly demurrage record exists
    await getOrCreateWeeklyDemurrage();
    
    console.log('Stop event started:', currentStopEvent.id, 'Reason:', pendingReason);
    notifyStateChange(getMotionState());
  } catch (error) {
    console.error('Error starting stop event:', error);
  }
}

/**
 * End the current stop event
 */
async function endStopEvent(): Promise<void> {
  if (!currentStopEvent) return;
  
  try {
    const location = await getCurrentLocation();
    const settings = await getSettings();
    const now = getCurrentTimestamp();
    const thresholdMinutes = settings?.demurrageThresholdMinutes || 50;
    
    // Calculate duration
    const durationMinutes = calculateDurationMinutes(currentStopEvent.startTime, now);
    
    // Update event
    currentStopEvent.endTime = now;
    currentStopEvent.endLocation = location;
    currentStopEvent.durationMinutes = durationMinutes;
    currentStopEvent.isDemurrage = isDemurrageEvent(durationMinutes, thresholdMinutes);
    
    console.log(`Stop event ending - Duration: ${durationMinutes} min, Threshold: ${thresholdMinutes} min, IsDemurrage: ${currentStopEvent.isDemurrage}`);
    
    await updateStopEvent(currentStopEvent);
    
    // Recalculate weekly totals if this was a demurrage event
    if (currentStopEvent.isDemurrage) {
      console.log('Recalculating weekly demurrage...');
      const weeklyData = await recalculateWeeklyDemurrage(currentStopEvent.weekStartDate);
      console.log(`Weekly total updated: ${weeklyData.totalDemurrageMinutes} min, ${weeklyData.eventCount} events`);
    }
    
    console.log('Stop event ended:', currentStopEvent.id, `Duration: ${durationMinutes} min`);
    currentStopEvent = null;
    notifyStateChange(getMotionState());
  } catch (error) {
    console.error('Error ending stop event:', error);
  }
}

/**
 * Update duration of current stop event (called periodically)
 */
async function updateCurrentStopDuration(): Promise<void> {
  if (!currentStopEvent) return;
  
  try {
    const now = getCurrentTimestamp();
    const durationMinutes = calculateDurationMinutes(currentStopEvent.startTime, now);
    const settings = await getSettings();
    const thresholdMinutes = settings?.demurrageThresholdMinutes || 50;
    
    currentStopEvent.durationMinutes = durationMinutes;
    currentStopEvent.isDemurrage = isDemurrageEvent(durationMinutes, thresholdMinutes);
    
    // Update in database
    await updateStopEvent(currentStopEvent);
    
    // Recalculate weekly totals if crossed threshold
    if (currentStopEvent.isDemurrage) {
      await recalculateWeeklyDemurrage(currentStopEvent.weekStartDate);
    }
    
    notifyStateChange(getMotionState());
  } catch (error) {
    console.error('Error updating stop duration:', error);
  }
}

/**
 * Notify callback of state changes
 */
function notifyStateChange(motionState: MotionState): void {
  if (stateCallback) {
    stateCallback({
      isTracking,
      currentStopEvent,
      motionState,
    });
  }
}

/**
 * Start tracking
 */
export async function startTracking(callback?: TrackingStateCallback, reason?: StopReason): Promise<boolean> {
  try {
    if (isTracking) {
      console.log('Tracking already started');
      return true;
    }
    
    if (callback) {
      stateCallback = callback;
    }
    
    // Store the reason to use for new stop events
    pendingReason = reason || null;
    
    // Check for any in-progress stop event from previous session
    currentStopEvent = await getCurrentStopEvent();
    
    // Start motion detection
    const started = await startMotionDetection(handleMotionChange);
    
    if (!started) {
      console.error('Failed to start motion detection');
      return false;
    }
    
    // Start periodic update for current stop duration
    updateInterval = setInterval(updateCurrentStopDuration, UPDATE_INTERVAL);
    
    isTracking = true;
    console.log('Tracking started with reason:', reason);
    
    notifyStateChange(getMotionState());
    return true;
  } catch (error) {
    console.error('Error starting tracking:', error);
    return false;
  }
}

/**
 * Stop tracking
 */
export async function stopTracking(): Promise<void> {
  try {
    stopMotionDetection();
    
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    
    // If there's a current stop event, end it
    if (currentStopEvent) {
      await endStopEvent();
    }
    
    isTracking = false;
    stateCallback = null;
    
    console.log('Tracking stopped');
  } catch (error) {
    console.error('Error stopping tracking:', error);
  }
}

/**
 * Get current tracking state
 */
export function getTrackingState(): TrackingState {
  return {
    isTracking,
    currentStopEvent,
    motionState: getMotionState(),
  };
}

/**
 * Check if tracking is active
 */
export function isTrackingActive(): boolean {
  return isTracking;
}

/**
 * Get current stop event if any
 */
export function getCurrentStop(): StopEvent | null {
  return currentStopEvent;
}

/**
 * Set tracking state callback
 */
export function setTrackingCallback(callback: TrackingStateCallback): void {
  stateCallback = callback;
}

/**
 * Force end current stop (manual intervention)
 */
export async function forceEndCurrentStop(): Promise<void> {
  if (currentStopEvent) {
    await endStopEvent();
  }
}

/**
 * Get demurrage status for current stop
 */
export function getCurrentStopDemurrageStatus(): {
  isActive: boolean;
  durationMinutes: number;
  isDemurrage: boolean;
  minutesUntilDemurrage: number;
} {
  if (!currentStopEvent) {
    return {
      isActive: false,
      durationMinutes: 0,
      isDemurrage: false,
      minutesUntilDemurrage: 50,
    };
  }
  
  const now = getCurrentTimestamp();
  const durationMinutes = calculateDurationMinutes(currentStopEvent.startTime, now);
  const minutesUntilDemurrage = Math.max(0, 50 - durationMinutes);
  
  return {
    isActive: true,
    durationMinutes,
    isDemurrage: durationMinutes > 50,
    minutesUntilDemurrage,
  };
}

/**
 * Update current stop event with photos and notes
 */
export async function updateCurrentStopPhotosNotes(
  photos: string[],
  notes: string
): Promise<void> {
  if (!currentStopEvent) {
    console.log('No current stop event to update photos/notes');
    return;
  }
  
  try {
    currentStopEvent = {
      ...currentStopEvent,
      photos,
      notes,
    };
    
    await updateStopEvent(currentStopEvent);
    console.log('Updated stop event with photos and notes');
  } catch (error) {
    console.error('Error updating photos/notes:', error);
  }
}
