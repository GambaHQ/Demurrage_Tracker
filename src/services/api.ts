// API service for communicating with the backend
import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config';
import { clearAllLocalData } from './database';

// API Configuration
const API_BASE_URL = config.apiUrl;

// Storage keys
const TOKEN_KEY = '@demurrage_token';
const REFRESH_TOKEN_KEY = '@demurrage_refresh_token';
const SESSION_KEY = '@demurrage_session';
const USER_KEY = '@demurrage_user';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'owner' | 'admin' | 'driver';
}

interface Company {
  id: string;
  name: string;
  email?: string;
}

interface AuthData {
  token: string;
  refreshToken: string;
  user: User;
  company: Company;
  sessionId?: string;
  vehicle?: {
    truckRego?: string;
    trailerRego?: string;
  };
}

// Get stored token
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

// Get stored user
export async function getStoredUser(): Promise<User | null> {
  const userData = await AsyncStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

// Get stored session
export async function getStoredSession(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

// Save auth data
async function saveAuthData(data: AuthData): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, data.token],
    [REFRESH_TOKEN_KEY, data.refreshToken],
    [USER_KEY, JSON.stringify(data.user)],
    [SESSION_KEY, data.sessionId || ''],
  ]);
}

// Clear auth data
export async function clearAuthData(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, SESSION_KEY]);
}

// Make authenticated API request
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }
    
    return data;
  } catch (error: any) {
    console.error('API Error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// ============ AUTH API ============

export async function registerCompany(data: {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  abn?: string;
  phone?: string;
}): Promise<ApiResponse<AuthData>> {
  const response = await apiRequest<AuthData>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (response.success && response.data) {
    await saveAuthData(response.data);
  }
  
  return response;
}

export async function login(data: {
  email: string;
  password: string;
  truckRego?: string;
  trailerRego?: string;
}): Promise<ApiResponse<AuthData>> {
  const response = await apiRequest<AuthData>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (response.success && response.data) {
    await saveAuthData(response.data);
  }
  
  return response;
}

export async function logout(): Promise<ApiResponse<void>> {
  const sessionId = await getStoredSession();
  
  const response = await apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
  
  // Clear auth data
  await clearAuthData();
  
  // Clear all local cached data to prevent data leakage between users
  try {
    await clearAllLocalData();
  } catch (error) {
    console.error('Error clearing local data on logout:', error);
  }
  
  return response;
}

export async function getCurrentUser(): Promise<ApiResponse<User>> {
  return apiRequest<User>('/auth/me');
}

export async function inviteUser(data: {
  email: string;
  role: 'admin' | 'driver';
}): Promise<ApiResponse<{ invitation: { token: string; email: string }; inviteLink: string }>> {
  return apiRequest('/auth/invite', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getInvitation(token: string): Promise<ApiResponse<{
  email: string;
  role: string;
  companyName: string;
  expiresAt: string;
}>> {
  return apiRequest(`/auth/invite/${token}`);
}

export async function acceptInvitation(data: {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<ApiResponse<AuthData>> {
  const response = await apiRequest<AuthData>('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (response.success && response.data) {
    await saveAuthData(response.data);
  }
  
  return response;
}

// ============ PASSWORD RESET ============

export async function forgotPassword(email: string): Promise<ApiResponse<{ message: string; resetCode?: string }>> {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(data: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<ApiResponse<{ message: string }>> {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getCompanyUsers(): Promise<ApiResponse<User[]>> {
  return apiRequest('/auth/users');
}

export async function getPendingInvitations(): Promise<ApiResponse<any[]>> {
  return apiRequest('/auth/invitations');
}

// ============ COMPANY API ============

export async function getCompany(): Promise<ApiResponse<Company>> {
  return apiRequest('/company');
}

export async function updateCompany(data: {
  name?: string;
  abn?: string;
  address?: string;
  phone?: string;
  hourlyRate?: number;
  demurrageThresholdMinutes?: number;
}): Promise<ApiResponse<Company>> {
  return apiRequest('/company', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ============ VEHICLE API ============

export async function getVehicles(): Promise<ApiResponse<any[]>> {
  return apiRequest('/vehicles');
}

export async function addVehicle(data: {
  truckRego: string;
  trailerRego?: string;
  description?: string;
}): Promise<ApiResponse<any>> {
  return apiRequest('/vehicles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSessionVehicle(data: {
  truckRego: string;
  trailerRego?: string;
}): Promise<ApiResponse<any>> {
  return apiRequest('/vehicles/session', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============ TRACKING API ============

export async function startTracking(data: {
  latitude: number;
  longitude: number;
  address?: string;
  reason?: string;
}): Promise<ApiResponse<any>> {
  return apiRequest('/tracking/start', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function endTracking(data: {
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<ApiResponse<any>> {
  return apiRequest('/tracking/end', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStopEvent(
  eventId: string,
  data: { notes?: string; photos?: string[] }
): Promise<ApiResponse<any>> {
  return apiRequest(`/tracking/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getActiveEvent(): Promise<ApiResponse<any>> {
  return apiRequest('/tracking/active');
}

export async function getStopEvents(params?: {
  startDate?: string;
  endDate?: string;
  userId?: string;
}): Promise<ApiResponse<any[]>> {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.set('startDate', params.startDate);
  if (params?.endDate) queryParams.set('endDate', params.endDate);
  if (params?.userId) queryParams.set('userId', params.userId);
  
  const query = queryParams.toString();
  return apiRequest(`/tracking/events${query ? `?${query}` : ''}`);
}

export async function getDemurrageEvents(weekStart: string): Promise<ApiResponse<any[]>> {
  return apiRequest(`/tracking/demurrage/${weekStart}`);
}

export async function getWeeklySummary(): Promise<ApiResponse<any>> {
  return apiRequest('/tracking/weekly');
}

// ============ CHECK AUTH STATUS ============

export async function checkAuthStatus(): Promise<{
  isAuthenticated: boolean;
  user: User | null;
}> {
  const token = await getToken();
  
  if (!token) {
    return { isAuthenticated: false, user: null };
  }
  
  const user = await getStoredUser();
  
  if (!user) {
    return { isAuthenticated: false, user: null };
  }
  
  // Optionally verify token with server
  const response = await getCurrentUser();
  
  if (!response.success) {
    await clearAuthData();
    return { isAuthenticated: false, user: null };
  }
  
  return { isAuthenticated: true, user };
}
