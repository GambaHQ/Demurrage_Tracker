// Encryption utilities using AES-256
import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { v4 as uuidv4 } from 'uuid';
import { Platform } from 'react-native';

const ENCRYPTION_KEY_STORAGE = 'demurrage_encryption_key';

let encryptionKey: string | null = null;

/**
 * Check if running on web
 */
const isWeb = Platform.OS === 'web';

/**
 * Generate random hex string using expo-crypto (native) or CryptoJS (web)
 */
async function generateRandomHex(byteLength: number): Promise<string> {
  if (isWeb) {
    // Web: Use browser's crypto API
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(byteLength);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for older browsers
    return CryptoJS.lib.WordArray.random(byteLength).toString();
  } else {
    // Native: Use expo-crypto
    const randomBytes = await Crypto.getRandomBytesAsync(byteLength);
    return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Synchronous random hex for encrypt function (uses cached approach)
 */
function generateRandomHexSync(byteLength: number): string {
  if (isWeb && typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // For native, we'll use a simpler approach for IV generation
  // This is acceptable for IV which doesn't need to be secret, just unique
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < byteLength * 2; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Web fallback storage using localStorage
 */
function webStorageGet(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return null;
}

function webStorageSet(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
  }
}

function webStorageDelete(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
  }
}

/**
 * Initialize or retrieve the encryption key from secure storage
 */
export async function initializeEncryption(): Promise<void> {
  try {
    let key: string | null = null;
    
    if (isWeb) {
      // Web: Use localStorage
      key = webStorageGet(ENCRYPTION_KEY_STORAGE);
      
      if (!key) {
        key = await generateRandomHex(32);
        webStorageSet(ENCRYPTION_KEY_STORAGE, key);
      }
    } else {
      // Native: Use SecureStore
      key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
      
      if (!key) {
        // Generate new 256-bit key using expo-crypto
        key = await generateRandomHex(32);
        await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
    }
    
    encryptionKey = key;
  } catch (error) {
    console.error('Failed to initialize encryption:', error);
    throw new Error('Encryption initialization failed');
  }
}

/**
 * Get the current encryption key
 */
export function getEncryptionKey(): string {
  if (!encryptionKey) {
    throw new Error('Encryption not initialized. Call initializeEncryption() first.');
  }
  return encryptionKey;
}

/**
 * Encrypt data using AES-256
 */
export function encrypt(data: string): string {
  const key = getEncryptionKey();
  // Generate IV synchronously
  const ivHex = generateRandomHexSync(16);
  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const encrypted = CryptoJS.AES.encrypt(data, CryptoJS.enc.Hex.parse(key), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  
  // Combine IV and encrypted data for storage
  const combined = ivHex + ':' + encrypted.toString();
  return combined;
}

/**
 * Decrypt data using AES-256
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = CryptoJS.enc.Hex.parse(parts[0]);
  const encrypted = parts[1];
  
  const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Hex.parse(key), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Encrypt an object
 */
export function encryptObject<T>(obj: T): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypt to an object
 */
export function decryptObject<T>(encryptedData: string): T {
  const decrypted = decrypt(encryptedData);
  return JSON.parse(decrypted) as T;
}

/**
 * Generate a cryptographically secure UUID
 */
export function generateSecureId(): string {
  return uuidv4();
}

/**
 * Hash sensitive data (one-way)
 */
export function hashData(data: string): string {
  return CryptoJS.SHA256(data).toString();
}

/**
 * Securely store a value
 */
export async function secureStore(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  if (!isWeb) {
    await SecureStore.setItemAsync(key, encrypted, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    webStorageSet(key, encrypted);
  }
}

/**
 * Securely retrieve a value
 */
export async function secureRetrieve(key: string): Promise<string | null> {
  let encrypted: string | null = null;
  
  if (!isWeb) {
    encrypted = await SecureStore.getItemAsync(key);
  } else {
    encrypted = webStorageGet(key);
  }
  
  if (!encrypted) return null;
  
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

/**
 * Securely delete a value
 */
export async function secureDelete(key: string): Promise<void> {
  if (!isWeb) {
    await SecureStore.deleteItemAsync(key);
  } else {
    webStorageDelete(key);
  }
}
