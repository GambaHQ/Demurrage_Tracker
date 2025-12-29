// Global state management with Zustand
import { create } from 'zustand';
import {
  StopEvent,
  WeeklyDemurrage,
  AppSettings,
  TrackingState,
  MotionState,
  AuthStatus,
  UserRole,
} from '../types';
import {
  getSettings,
  saveSettings as dbSaveSettings,
  getOrCreateWeeklyDemurrage,
  getRecentStopEvents,
  getAllWeeklyDemurrage,
} from '../services/database';
import { initializeDatabase } from '../services/database';
import { initializeEncryption } from '../utils/encryption';
import { getWeekStartISO } from '../utils/dateUtils';

// User type from API
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'owner' | 'admin' | 'driver';
}

// Company type from API
interface Company {
  id: string;
  name: string;
  email?: string;
}

interface AppStore {
  // App State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Auth State
  authStatus: AuthStatus;
  userRole: UserRole;
  user: User | null;
  company: Company | null;
  sessionId: string | null;
  
  // Tracking State
  isTracking: boolean;
  currentStopEvent: StopEvent | null;
  motionState: MotionState;
  
  // Vehicle
  truckRego: string | null;
  trailerRego: string | null;
  
  // Data
  settings: AppSettings | null;
  currentWeekDemurrage: WeeklyDemurrage | null;
  recentStops: StopEvent[];
  weeklyHistory: WeeklyDemurrage[];
  
  // Actions
  initialize: () => Promise<void>;
  setAuthStatus: (status: AuthStatus) => void;
  setUserRole: (role: UserRole) => void;
  setUser: (user: User | null) => void;
  setCompany: (company: Company | null) => void;
  setSessionId: (sessionId: string | null) => void;
  setVehicle: (truckRego: string | null, trailerRego: string | null) => void;
  updateTrackingState: (state: TrackingState) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadCurrentWeekData: () => Promise<void>;
  loadRecentStops: () => Promise<void>;
  loadWeeklyHistory: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial State
  isInitialized: false,
  isLoading: true,
  error: null,
  authStatus: 'checking',
  userRole: 'driver', // Default to driver view
  user: null,
  company: null,
  sessionId: null,
  isTracking: false,
  currentStopEvent: null,
  motionState: {
    isMoving: true,
    speed: 0,
    lastUpdate: Date.now(),
  },
  truckRego: null,
  trailerRego: null,
  settings: null,
  currentWeekDemurrage: null,
  recentStops: [],
  weeklyHistory: [],
  
  // Actions
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });
      
      // Initialize encryption first
      await initializeEncryption();
      
      // Initialize database
      await initializeDatabase();
      
      // Load initial data
      await get().loadSettings();
      await get().loadCurrentWeekData();
      await get().loadRecentStops();
      
      set({ isInitialized: true, isLoading: false });
    } catch (error) {
      console.error('Initialization error:', error);
      set({ error: String(error), isLoading: false });
    }
  },
  
  setAuthStatus: (authStatus) => {
    set({ authStatus });
  },
  
  setUserRole: (userRole) => {
    set({ userRole });
  },
  
  setUser: (user) => {
    set({ user, userRole: user?.role === 'driver' ? 'driver' : 'admin' });
  },
  
  setCompany: (company) => {
    set({ company });
  },
  
  setSessionId: (sessionId) => {
    set({ sessionId });
  },
  
  setVehicle: (truckRego, trailerRego) => {
    set({ truckRego, trailerRego });
  },
  
  updateTrackingState: (state) => {
    set({
      isTracking: state.isTracking,
      currentStopEvent: state.currentStopEvent,
      motionState: state.motionState,
    });
  },
  
  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({ settings });
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  },
  
  saveSettings: async (settings) => {
    try {
      await dbSaveSettings(settings);
      set({ settings });
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  },
  
  loadCurrentWeekData: async () => {
    try {
      const weekStartDate = getWeekStartISO();
      const currentWeekDemurrage = await getOrCreateWeeklyDemurrage(weekStartDate);
      set({ currentWeekDemurrage });
    } catch (error) {
      console.error('Error loading current week data:', error);
    }
  },
  
  loadRecentStops: async () => {
    try {
      const recentStops = await getRecentStopEvents(20);
      set({ recentStops });
    } catch (error) {
      console.error('Error loading recent stops:', error);
    }
  },
  
  loadWeeklyHistory: async () => {
    try {
      const weeklyHistory = await getAllWeeklyDemurrage();
      set({ weeklyHistory });
    } catch (error) {
      console.error('Error loading weekly history:', error);
    }
  },
  
  refreshAllData: async () => {
    await get().loadCurrentWeekData();
    await get().loadRecentStops();
    await get().loadWeeklyHistory();
  },
  
  setError: (error) => {
    set({ error });
  },
  
  setLoading: (isLoading) => {
    set({ isLoading });
  },
  
  logout: () => {
    set({
      authStatus: 'unauthenticated',
      user: null,
      company: null,
      sessionId: null,
      truckRego: null,
      trailerRego: null,
    });
  },
}));
