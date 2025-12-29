// Authentication service with biometric and PIN support
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { hashData } from '../utils/encryption';

const PIN_STORAGE_KEY = 'demurrage_pin_hash';
const AUTH_ENABLED_KEY = 'demurrage_auth_enabled';
const BIOMETRIC_ENABLED_KEY = 'demurrage_biometric_enabled';

const isWeb = Platform.OS === 'web';

// Web storage helpers
function webGet(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return null;
}

function webSet(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
  }
}

function webDelete(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
  }
}

// Cross-platform secure storage wrappers
async function secureGet(key: string): Promise<string | null> {
  if (isWeb) {
    return webGet(key);
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    webSet(key, value);
  } else {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

async function secureRemove(key: string): Promise<void> {
  if (isWeb) {
    webDelete(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export interface AuthConfig {
  pinEnabled: boolean;
  biometricEnabled: boolean;
  biometricType: LocalAuthentication.AuthenticationType | null;
}

/**
 * Check if device supports biometric authentication
 */
export async function isBiometricSupported(): Promise<boolean> {
  if (isWeb) return false; // Biometric not supported on web
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  } catch (error) {
    console.error('Error checking biometric support:', error);
    return false;
  }
}

/**
 * Get available authentication types
 */
export async function getAuthenticationTypes(): Promise<LocalAuthentication.AuthenticationType[]> {
  if (isWeb) return []; // Not available on web
  try {
    return await LocalAuthentication.supportedAuthenticationTypesAsync();
  } catch (error) {
    console.error('Error getting auth types:', error);
    return [];
  }
}

/**
 * Get biometric type name for display
 */
export async function getBiometricTypeName(): Promise<string> {
  const types = await getAuthenticationTypes();
  
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint';
  } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris';
  }
  
  return 'Biometric';
}

/**
 * Authenticate with biometrics
 */
export async function authenticateWithBiometrics(
  promptMessage: string = 'Authenticate to access Demurrage Tracker'
): Promise<{ success: boolean; error?: string }> {
  if (isWeb) {
    return { success: false, error: 'Biometric authentication not available on web' };
  }
  try {
    const isSupported = await isBiometricSupported();
    
    if (!isSupported) {
      return { success: false, error: 'Biometric authentication not available' };
    }
    
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    
    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error || 'Authentication failed' };
    }
  } catch (error) {
    console.error('Error during biometric auth:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Set up PIN
 */
export async function setupPIN(pin: string): Promise<boolean> {
  try {
    if (pin.length < 4 || pin.length > 8) {
      throw new Error('PIN must be 4-8 digits');
    }
    
    const pinHash = hashData(pin);
    await secureSet(PIN_STORAGE_KEY, pinHash);
    await secureSet(AUTH_ENABLED_KEY, 'true');
    
    return true;
  } catch (error) {
    console.error('Error setting up PIN:', error);
    return false;
  }
}

/**
 * Verify PIN
 */
export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    const storedHash = await secureGet(PIN_STORAGE_KEY);
    
    if (!storedHash) {
      return false;
    }
    
    const inputHash = hashData(pin);
    return storedHash === inputHash;
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
}

/**
 * Change PIN
 */
export async function changePIN(oldPin: string, newPin: string): Promise<boolean> {
  try {
    const isValid = await verifyPIN(oldPin);
    
    if (!isValid) {
      return false;
    }
    
    return await setupPIN(newPin);
  } catch (error) {
    console.error('Error changing PIN:', error);
    return false;
  }
}

/**
 * Remove PIN (disable authentication)
 */
export async function removePIN(): Promise<boolean> {
  try {
    await secureRemove(PIN_STORAGE_KEY);
    await secureRemove(AUTH_ENABLED_KEY);
    await secureRemove(BIOMETRIC_ENABLED_KEY);
    return true;
  } catch (error) {
    console.error('Error removing PIN:', error);
    return false;
  }
}

/**
 * Check if PIN is set up
 */
export async function isPINEnabled(): Promise<boolean> {
  try {
    const enabled = await secureGet(AUTH_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('Error checking PIN status:', error);
    return false;
  }
}

/**
 * Enable/disable biometric authentication
 */
export async function setBiometricEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) {
      const isSupported = await isBiometricSupported();
      if (!isSupported) {
        return false;
      }
    }
    
    await secureSet(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    return true;
  } catch (error) {
    console.error('Error setting biometric status:', error);
    return false;
  }
}

/**
 * Check if biometric is enabled
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await secureGet(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('Error checking biometric status:', error);
    return false;
  }
}

/**
 * Get current auth configuration
 */
export async function getAuthConfig(): Promise<AuthConfig> {
  const pinEnabled = await isPINEnabled();
  const biometricEnabled = await isBiometricEnabled();
  const types = await getAuthenticationTypes();
  
  return {
    pinEnabled,
    biometricEnabled: biometricEnabled && types.length > 0,
    biometricType: types.length > 0 ? types[0] : null,
  };
}

/**
 * Perform full authentication flow
 */
export async function authenticate(): Promise<{ success: boolean; method?: string; error?: string }> {
  const config = await getAuthConfig();
  
  // If no auth is enabled, just return success
  if (!config.pinEnabled && !config.biometricEnabled) {
    return { success: true, method: 'none' };
  }
  
  // Try biometric first if enabled
  if (config.biometricEnabled) {
    const biometricResult = await authenticateWithBiometrics();
    if (biometricResult.success) {
      return { success: true, method: 'biometric' };
    }
    // If biometric failed but PIN is also enabled, we'll fall through to PIN
    if (!config.pinEnabled) {
      return { success: false, error: biometricResult.error };
    }
  }
  
  // If we get here, PIN authentication is needed
  // Return indicating PIN is required (UI will handle PIN input)
  return { success: false, method: 'pin_required' };
}

/**
 * Quick security check - for background operations
 */
export async function isSecurityEnabled(): Promise<boolean> {
  const config = await getAuthConfig();
  return config.pinEnabled || config.biometricEnabled;
}
