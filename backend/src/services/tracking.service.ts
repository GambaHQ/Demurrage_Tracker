// Tracking service for stop events
import { query, queryOne } from '../config/database';
import { StopEvent, Location, StopReason, WeeklyDemurrage } from '../types';

// Create a new stop event
export async function createStopEvent(
  companyId: string,
  userId: string,
  sessionId: string,
  startLocation: Location,
  truckRego?: string,
  trailerRego?: string,
  reason?: StopReason
): Promise<StopEvent> {
  const result = await queryOne<any>(`
    INSERT INTO stop_events (
      company_id, user_id, session_id, truck_rego, trailer_rego,
      start_time, start_latitude, start_longitude, start_address, reason
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
    RETURNING *
  `, [
    companyId, userId, sessionId, truckRego || null, trailerRego || null,
    startLocation.latitude, startLocation.longitude, startLocation.address || null, reason || null
  ]);
  
  return mapStopEvent(result);
}

// End a stop event
export async function endStopEvent(
  eventId: string,
  endLocation: Location,
  demurrageThresholdMinutes: number
): Promise<StopEvent | null> {
  // Calculate duration and check if demurrage
  const result = await queryOne<any>(`
    UPDATE stop_events 
    SET 
      end_time = NOW(),
      end_latitude = $2,
      end_longitude = $3,
      end_address = $4,
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time)) / 60,
      is_demurrage = EXTRACT(EPOCH FROM (NOW() - start_time)) / 60 >= $5
    WHERE id = $1
    RETURNING *
  `, [eventId, endLocation.latitude, endLocation.longitude, endLocation.address || null, demurrageThresholdMinutes]);
  
  if (!result) return null;
  
  // If it's demurrage, update weekly totals
  if (result.is_demurrage) {
    await updateWeeklyDemurrage(result.company_id, result.start_time);
  }
  
  return mapStopEvent(result);
}

// Update stop event with notes/photos
export async function updateStopEventDetails(
  eventId: string,
  notes?: string,
  photos?: string[]
): Promise<StopEvent | null> {
  const result = await queryOne<any>(`
    UPDATE stop_events 
    SET notes = COALESCE($2, notes), photos = COALESCE($3, photos)
    WHERE id = $1
    RETURNING *
  `, [eventId, notes || null, photos || null]);
  
  if (!result) return null;
  return mapStopEvent(result);
}

// Get stop events for a company
export async function getCompanyStopEvents(
  companyId: string,
  startDate?: Date,
  endDate?: Date,
  userId?: string
): Promise<StopEvent[]> {
  let sql = `
    SELECT se.*, u.first_name, u.last_name 
    FROM stop_events se
    JOIN users u ON se.user_id = u.id
    WHERE se.company_id = $1
  `;
  const params: any[] = [companyId];
  let paramIndex = 2;
  
  if (startDate) {
    sql += ` AND se.start_time >= $${paramIndex++}`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND se.start_time <= $${paramIndex++}`;
    params.push(endDate);
  }
  if (userId) {
    sql += ` AND se.user_id = $${paramIndex++}`;
    params.push(userId);
  }
  
  sql += ` ORDER BY se.start_time DESC`;
  
  const results = await query<any>(sql, params);
  return results.map(mapStopEvent);
}

// Get demurrage events for a week
export async function getDemurrageEventsByWeek(
  companyId: string,
  weekStartDate: string
): Promise<StopEvent[]> {
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const results = await query<any>(`
    SELECT * FROM stop_events 
    WHERE company_id = $1 
    AND is_demurrage = true
    AND start_time >= $2 
    AND start_time < $3
    ORDER BY start_time DESC
  `, [companyId, weekStartDate, weekEnd.toISOString().split('T')[0]]);
  
  return results.map(mapStopEvent);
}

// Get or create weekly demurrage record
export async function getOrCreateWeeklyDemurrage(
  companyId: string,
  date?: Date
): Promise<WeeklyDemurrage> {
  const targetDate = date || new Date();
  const dayOfWeek = targetDate.getDay();
  const weekStart = new Date(targetDate);
  weekStart.setDate(targetDate.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const weekStartDate = weekStart.toISOString().split('T')[0];
  const weekEndDate = weekEnd.toISOString().split('T')[0];
  
  // Try to get existing record
  let result = await queryOne<any>(`
    SELECT * FROM weekly_demurrage 
    WHERE company_id = $1 AND week_start_date = $2
  `, [companyId, weekStartDate]);
  
  if (!result) {
    // Create new record
    result = await queryOne<any>(`
      INSERT INTO weekly_demurrage (company_id, week_start_date, week_end_date)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [companyId, weekStartDate, weekEndDate]);
  }
  
  return {
    id: result.id,
    companyId: result.company_id,
    weekStartDate: result.week_start_date.toISOString().split('T')[0],
    weekEndDate: result.week_end_date.toISOString().split('T')[0],
    totalMinutes: result.total_minutes,
    eventCount: result.event_count,
    invoiceGenerated: result.invoice_generated,
    invoiceSent: result.invoice_sent,
    invoicePath: result.invoice_path,
  };
}

// Update weekly demurrage totals
export async function updateWeeklyDemurrage(companyId: string, eventDate: Date): Promise<void> {
  const weekly = await getOrCreateWeeklyDemurrage(companyId, eventDate);
  
  // Recalculate from events
  const events = await getDemurrageEventsByWeek(companyId, weekly.weekStartDate);
  const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
  
  await query(`
    UPDATE weekly_demurrage 
    SET total_minutes = $2, event_count = $3
    WHERE id = $1
  `, [weekly.id, Math.round(totalMinutes), events.length]);
}

// Get active stop event for user
export async function getActiveStopEvent(userId: string): Promise<StopEvent | null> {
  const result = await queryOne<any>(`
    SELECT * FROM stop_events 
    WHERE user_id = $1 AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `, [userId]);
  
  if (!result) return null;
  return mapStopEvent(result);
}

// Helper to map database row to StopEvent
function mapStopEvent(row: any): StopEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    sessionId: row.session_id,
    vehicleId: row.vehicle_id,
    truckRego: row.truck_rego,
    trailerRego: row.trailer_rego,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes || 0,
    startLocation: {
      latitude: parseFloat(row.start_latitude),
      longitude: parseFloat(row.start_longitude),
      address: row.start_address,
    },
    endLocation: row.end_latitude ? {
      latitude: parseFloat(row.end_latitude),
      longitude: parseFloat(row.end_longitude),
      address: row.end_address,
    } : undefined,
    reason: row.reason,
    notes: row.notes,
    photos: row.photos,
    isDemurrage: row.is_demurrage,
    createdAt: row.created_at,
  };
}
