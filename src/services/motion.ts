// Motion detection service using accelerometer and GPS speed
import { Accelerometer, AccelerometerMeasurement } from 'expo-sensors';
import * as Location from 'expo-location';
import { MotionState } from '../types';

// Configuration constants
const MOTION_THRESHOLD = 0.15; // Acceleration threshold to detect movement
const SPEED_THRESHOLD = 1.5; // Speed in m/s (about 5.4 km/h) to consider moving
const STOP_CONFIRMATION_TIME = 10000; // 10 seconds of no movement to confirm stop
const MOVEMENT_CONFIRMATION_TIME = 5000; // 5 seconds of movement to confirm moving

type MotionCallback = (isMoving: boolean, state: MotionState) => void;

let accelerometerSubscription: { remove: () => void } | null = null;
let locationSubscription: Location.LocationSubscription | null = null;
let motionCallback: MotionCallback | null = null;
let isRunning = false;

// State tracking
let currentState: MotionState = {
  isMoving: true, // Assume moving initially
  speed: 0,
  lastUpdate: Date.now(),
};

// Smoothing buffers
const accelerationBuffer: number[] = [];
const speedBuffer: number[] = [];
const BUFFER_SIZE = 10;

// Confirmation timers
let stopConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
let movementConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStateChange: 'stopped' | 'moving' | null = null;

/**
 * Calculate magnitude of acceleration vector
 */
function calculateAccelerationMagnitude(data: AccelerometerMeasurement): number {
  const { x, y, z } = data;
  // Remove gravity (approximately 1g when stationary)
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  return Math.abs(magnitude - 1); // Deviation from gravity
}

/**
 * Add to buffer and get average
 */
function addToBuffer(buffer: number[], value: number): number {
  buffer.push(value);
  if (buffer.length > BUFFER_SIZE) {
    buffer.shift();
  }
  return buffer.reduce((a, b) => a + b, 0) / buffer.length;
}

/**
 * Process sensor data and determine motion state
 */
function processMotionData(acceleration: number, speed: number): void {
  const avgAcceleration = addToBuffer(accelerationBuffer, acceleration);
  const avgSpeed = addToBuffer(speedBuffer, speed);
  
  const wasMoving = currentState.isMoving;
  
  // Determine if currently moving based on both acceleration and speed
  const isMovingByAcceleration = avgAcceleration > MOTION_THRESHOLD;
  const isMovingBySpeed = avgSpeed > SPEED_THRESHOLD;
  const isCurrentlyMoving = isMovingByAcceleration || isMovingBySpeed;
  
  currentState.speed = avgSpeed;
  currentState.lastUpdate = Date.now();
  
  // Handle state transitions with confirmation delays
  if (wasMoving && !isCurrentlyMoving) {
    // Potentially stopping - need confirmation
    if (pendingStateChange !== 'stopped') {
      pendingStateChange = 'stopped';
      
      // Clear any pending movement confirmation
      if (movementConfirmationTimer) {
        clearTimeout(movementConfirmationTimer);
        movementConfirmationTimer = null;
      }
      
      // Start stop confirmation timer
      stopConfirmationTimer = setTimeout(() => {
        if (pendingStateChange === 'stopped') {
          currentState.isMoving = false;
          pendingStateChange = null;
          notifyStateChange();
        }
      }, STOP_CONFIRMATION_TIME);
    }
  } else if (!wasMoving && isCurrentlyMoving) {
    // Potentially moving - need confirmation
    if (pendingStateChange !== 'moving') {
      pendingStateChange = 'moving';
      
      // Clear any pending stop confirmation
      if (stopConfirmationTimer) {
        clearTimeout(stopConfirmationTimer);
        stopConfirmationTimer = null;
      }
      
      // Start movement confirmation timer
      movementConfirmationTimer = setTimeout(() => {
        if (pendingStateChange === 'moving') {
          currentState.isMoving = true;
          pendingStateChange = null;
          notifyStateChange();
        }
      }, MOVEMENT_CONFIRMATION_TIME);
    }
  } else if (wasMoving && isCurrentlyMoving) {
    // Still moving - clear any pending stop
    if (stopConfirmationTimer) {
      clearTimeout(stopConfirmationTimer);
      stopConfirmationTimer = null;
    }
    pendingStateChange = null;
  } else if (!wasMoving && !isCurrentlyMoving) {
    // Still stopped - clear any pending movement
    if (movementConfirmationTimer) {
      clearTimeout(movementConfirmationTimer);
      movementConfirmationTimer = null;
    }
    pendingStateChange = null;
  }
}

/**
 * Notify callback of state change
 */
function notifyStateChange(): void {
  if (motionCallback) {
    motionCallback(currentState.isMoving, { ...currentState });
  }
}

/**
 * Start motion detection
 */
export async function startMotionDetection(callback: MotionCallback): Promise<boolean> {
  try {
    if (isRunning) {
      console.log('Motion detection already running');
      return true;
    }
    
    motionCallback = callback;
    
    // Check accelerometer availability
    const isAccelerometerAvailable = await Accelerometer.isAvailableAsync();
    
    if (isAccelerometerAvailable) {
      // Set update interval (100ms)
      Accelerometer.setUpdateInterval(100);
      
      // Subscribe to accelerometer
      accelerometerSubscription = Accelerometer.addListener((data) => {
        const acceleration = calculateAccelerationMagnitude(data);
        processMotionData(acceleration, currentState.speed);
      });
    }
    
    // Also use GPS speed for more accurate detection
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status === 'granted') {
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (location) => {
          const speed = location.coords.speed || 0;
          currentState.speed = speed;
        }
      );
    }
    
    isRunning = true;
    console.log('Motion detection started');
    
    // Initial state notification
    notifyStateChange();
    
    return true;
  } catch (error) {
    console.error('Error starting motion detection:', error);
    return false;
  }
}

/**
 * Stop motion detection
 */
export function stopMotionDetection(): void {
  if (accelerometerSubscription) {
    accelerometerSubscription.remove();
    accelerometerSubscription = null;
  }
  
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  
  if (stopConfirmationTimer) {
    clearTimeout(stopConfirmationTimer);
    stopConfirmationTimer = null;
  }
  
  if (movementConfirmationTimer) {
    clearTimeout(movementConfirmationTimer);
    movementConfirmationTimer = null;
  }
  
  motionCallback = null;
  isRunning = false;
  pendingStateChange = null;
  accelerationBuffer.length = 0;
  speedBuffer.length = 0;
  
  console.log('Motion detection stopped');
}

/**
 * Get current motion state
 */
export function getMotionState(): MotionState {
  return { ...currentState };
}

/**
 * Check if motion detection is running
 */
export function isMotionDetectionRunning(): boolean {
  return isRunning;
}

/**
 * Force check motion state (useful for background tasks)
 */
export async function forceCheckMotionState(): Promise<MotionState> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const speed = location.coords.speed || 0;
      const isMoving = speed > SPEED_THRESHOLD;
      
      currentState = {
        isMoving,
        speed,
        lastUpdate: Date.now(),
      };
    }
    
    return { ...currentState };
  } catch (error) {
    console.error('Error force checking motion state:', error);
    return { ...currentState };
  }
}

/**
 * Get speed in km/h
 */
export function getSpeedKmh(): number {
  return currentState.speed * 3.6; // Convert m/s to km/h
}

/**
 * Get speed in mph
 */
export function getSpeedMph(): number {
  return currentState.speed * 2.237; // Convert m/s to mph
}
