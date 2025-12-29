// Shared types for the backend API

export interface Company {
  id: string;
  name: string;
  abn?: string;
  address?: string;
  email: string;
  phone?: string;
  hourlyRate: number;
  demurrageThresholdMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'owner' | 'admin' | 'driver';

export interface User {
  id: string;
  companyId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vehicle {
  id: string;
  companyId: string;
  truckRego: string;
  trailerRego?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  vehicleId?: string;
  truckRego?: string;
  trailerRego?: string;
  startedAt: Date;
  endedAt?: Date;
}

export type StopReason = 
  | 'plant_breakdown'
  | 'site_issue'
  | 'trailer_issue'
  | 'curfew'
  | 'truck_queue'
  | 'other';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface StopEvent {
  id: string;
  companyId: string;
  userId: string;
  sessionId: string;
  vehicleId?: string;
  truckRego?: string;
  trailerRego?: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  startLocation: Location;
  endLocation?: Location;
  reason?: StopReason;
  notes?: string;
  photos?: string[];
  isDemurrage: boolean;
  createdAt: Date;
}

export interface WeeklyDemurrage {
  id: string;
  companyId: string;
  weekStartDate: string; // YYYY-MM-DD
  weekEndDate: string;
  totalMinutes: number;
  eventCount: number;
  invoiceGenerated: boolean;
  invoiceSent: boolean;
  invoicePath?: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  weeklyDemurrageId: string;
  invoiceNumber: string;
  generatedAt: Date;
  sentAt?: Date;
  recipientEmail: string;
  totalHours: number;
  totalMinutes: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  pdfPath?: string;
}

export interface Invitation {
  id: string;
  companyId: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  usedAt?: Date;
  invitedBy: string;
  createdAt: Date;
}

// API Request/Response types
export interface AuthTokenPayload {
  userId: string;
  companyId: string;
  role: UserRole;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  truckRego?: string;
  trailerRego?: string;
}

export interface RegisterCompanyRequest {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  abn?: string;
  phone?: string;
}

export interface InviteUserRequest {
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
