// Date and time utilities for demurrage calculations
import {
  startOfWeek,
  endOfWeek,
  format,
  differenceInMinutes,
  differenceInHours,
  isWithinInterval,
  addDays,
  isSameWeek,
} from 'date-fns';

/**
 * Get the start of the week (Sunday) for a given date
 */
export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 0 }); // 0 = Sunday
}

/**
 * Get the end of the week (Saturday) for a given date
 */
export function getWeekEnd(date: Date = new Date()): Date {
  return endOfWeek(date, { weekStartsOn: 0 }); // 0 = Sunday
}

/**
 * Get the week start date as ISO string
 */
export function getWeekStartISO(date: Date = new Date()): string {
  return format(getWeekStart(date), 'yyyy-MM-dd');
}

/**
 * Get the week end date as ISO string
 */
export function getWeekEndISO(date: Date = new Date()): string {
  return format(getWeekEnd(date), 'yyyy-MM-dd');
}

/**
 * Calculate duration in minutes between two timestamps
 */
export function calculateDurationMinutes(startTime: number, endTime: number): number {
  return differenceInMinutes(new Date(endTime), new Date(startTime));
}

/**
 * Calculate duration in hours (decimal) between two timestamps
 */
export function calculateDurationHours(startTime: number, endTime: number): number {
  const minutes = calculateDurationMinutes(startTime, endTime);
  return Math.round((minutes / 60) * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if a stop event qualifies as demurrage (> 50 minutes by default)
 */
export function isDemurrageEvent(durationMinutes: number, thresholdMinutes: number = 50): boolean {
  return durationMinutes > thresholdMinutes;
}

/**
 * Check if a date is within the current week
 */
export function isCurrentWeek(date: Date): boolean {
  return isSameWeek(date, new Date(), { weekStartsOn: 0 });
}

/**
 * Check if a timestamp is within a specific week
 */
export function isWithinWeek(timestamp: number, weekStartDate: string): boolean {
  const date = new Date(timestamp);
  const weekStart = new Date(weekStartDate);
  const weekEnd = addDays(weekStart, 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return isWithinInterval(date, { start: weekStart, end: weekEnd });
}

/**
 * Format timestamp to readable date string
 */
export function formatDateTime(timestamp: number): string {
  return format(new Date(timestamp), 'MMM dd, yyyy HH:mm');
}

/**
 * Format timestamp to time only
 */
export function formatTime(timestamp: number): string {
  return format(new Date(timestamp), 'HH:mm');
}

/**
 * Format timestamp to date only
 */
export function formatDate(timestamp: number): string {
  return format(new Date(timestamp), 'MMM dd, yyyy');
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins} min`;
  } else if (mins === 0) {
    return `${hours} hr`;
  } else {
    return `${hours} hr ${mins} min`;
  }
}

/**
 * Format minutes to hours:minutes string (HH:MM)
 */
export function formatMinutesToHHMM(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get current timestamp
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Get week range display string
 */
export function getWeekRangeDisplay(weekStartDate: string): string {
  const start = new Date(weekStartDate);
  const end = addDays(start, 6);
  return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
}

/**
 * Check if it's time to generate the weekly invoice (Saturday 11:59 PM)
 */
export function shouldGenerateWeeklyInvoice(): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours();
  
  // Generate on Saturday at or after 11 PM
  return dayOfWeek === 6 && hour >= 23;
}

/**
 * Check if it's time to send the weekly invoice (Sunday 12:05 AM)
 */
export function shouldSendWeeklyInvoice(): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Send on Sunday between 12:00 AM and 12:30 AM
  return dayOfWeek === 0 && hour === 0 && minute >= 5;
}
