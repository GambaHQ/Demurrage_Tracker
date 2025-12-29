// Core type definitions for Demurrage Tracking App

export type StopReason = 
  | 'plant_breakdown'
  | 'site_issue'
  | 'trailer_issue'
  | 'curfew'
  | 'truck_queue'
  | 'other';

export const STOP_REASONS: { value: StopReason; label: string }[] = [
  { value: 'plant_breakdown', label: 'Plant Breakdown' },
  { value: 'site_issue', label: 'Site Issue' },
  { value: 'trailer_issue', label: 'Trailer Issue' },
  { value: 'curfew', label: 'Curfew' },
  { value: 'truck_queue', label: 'Truck Queue' },
  { value: 'other', label: 'Other' },
];

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface StopEvent {
  id: string;
  startTime: number; // Unix timestamp
  endTime: number | null; // Unix timestamp, null if still stopped
  startLocation: Location;
  endLocation: Location | null;
  durationMinutes: number;
  isDemurrage: boolean; // true if duration > threshold
  weekStartDate: string; // ISO date string for Sunday of the week
  synced: boolean;
  reason?: StopReason; // Reason for the stop
  notes?: string; // Driver notes about the stop
  photos?: string[]; // Array of photo URIs
}

export interface WeeklyDemurrage {
  id: string;
  weekStartDate: string; // Sunday ISO date
  weekEndDate: string; // Saturday ISO date
  totalDemurrageMinutes: number;
  eventCount: number;
  invoiceGenerated: boolean;
  invoiceSent: boolean;
  invoicePath?: string;
}

export interface Invoice {
  id: string;
  weeklyDemurrageId: string;
  generatedAt: number; // Unix timestamp
  sentAt: number | null;
  recipientEmail: string;
  totalHours: number;
  totalMinutes: number;
  pdfPath: string;
  events: StopEvent[];
}

export interface AppSettings {
  recipientEmail: string;
  demurrageThresholdMinutes: number; // default 50
  autoSendInvoice: boolean;
  trackingEnabled: boolean;
  biometricEnabled: boolean;
  hourlyRate?: number; // Optional billing rate
  companyName?: string;
  companyAddress?: string;
}

export interface MotionState {
  isMoving: boolean;
  speed: number; // m/s
  lastUpdate: number;
}

export interface TrackingState {
  isTracking: boolean;
  currentStopEvent: StopEvent | null;
  motionState: MotionState;
}

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'checking';

export type UserRole = 'driver' | 'admin';

export interface AppState {
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  isInitialized: boolean;
  userRole?: UserRole;
}
