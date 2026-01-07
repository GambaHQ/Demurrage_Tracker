// Deadhead travel tracking service
import { query, queryOne } from '../config/database';
import { DeadheadTrip, DeadheadBreak, Location } from '../types';

// Start a new deadhead trip
export async function startDeadheadTrip(data: {
  companyId: string;
  userId: string;
  sessionId?: string;
  truckRego: string;
  trailerRego?: string;
  startOdometer: number;
  startLocation: Location;
}): Promise<DeadheadTrip> {
  const result = await queryOne<any>(`
    INSERT INTO deadhead_trips (
      company_id, user_id, session_id, truck_rego, trailer_rego,
      start_odometer, start_time, start_latitude, start_longitude, start_address
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
    RETURNING *
  `, [
    data.companyId,
    data.userId,
    data.sessionId,
    data.truckRego,
    data.trailerRego,
    data.startOdometer,
    data.startLocation.latitude,
    data.startLocation.longitude,
    data.startLocation.address
  ]);

  return mapDeadheadTrip(result);
}

// Get active deadhead trip for user
export async function getActiveDeadheadTrip(userId: string, companyId: string): Promise<DeadheadTrip | null> {
  const result = await queryOne<any>(`
    SELECT dt.*, u.first_name || ' ' || u.last_name as user_name
    FROM deadhead_trips dt
    JOIN users u ON dt.user_id = u.id
    WHERE dt.user_id = $1 
    AND dt.company_id = $2
    AND dt.is_complete = false
    ORDER BY dt.start_time DESC
    LIMIT 1
  `, [userId, companyId]);

  if (!result) return null;

  const trip = mapDeadheadTrip(result);
  
  // Load breaks for this trip
  const breaks = await query<any>(`
    SELECT * FROM deadhead_breaks
    WHERE trip_id = $1
    ORDER BY start_time ASC
  `, [trip.id]);

  trip.breaks = breaks.map(mapDeadheadBreak);
  
  return trip;
}

// Start a break during a trip
export async function startBreak(data: {
  tripId: string;
  startLocation: Location;
}): Promise<DeadheadBreak> {
  const result = await queryOne<any>(`
    INSERT INTO deadhead_breaks (
      trip_id, start_time, start_latitude, start_longitude, start_address
    ) VALUES ($1, NOW(), $2, $3, $4)
    RETURNING *
  `, [
    data.tripId,
    data.startLocation.latitude,
    data.startLocation.longitude,
    data.startLocation.address
  ]);

  return mapDeadheadBreak(result);
}

// End a break
export async function endBreak(data: {
  breakId: string;
  endLocation: Location;
}): Promise<DeadheadBreak> {
  const result = await queryOne<any>(`
    UPDATE deadhead_breaks
    SET 
      end_time = NOW(),
      end_latitude = $2,
      end_longitude = $3,
      end_address = $4,
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time)) / 60
    WHERE id = $1
    RETURNING *
  `, [
    data.breakId,
    data.endLocation.latitude,
    data.endLocation.longitude,
    data.endLocation.address
  ]);

  // Update total break minutes on trip
  await query(`
    UPDATE deadhead_trips
    SET total_break_minutes = (
      SELECT COALESCE(SUM(duration_minutes), 0)
      FROM deadhead_breaks
      WHERE trip_id = (SELECT trip_id FROM deadhead_breaks WHERE id = $1)
    )
    WHERE id = (SELECT trip_id FROM deadhead_breaks WHERE id = $1)
  `, [data.breakId]);

  return mapDeadheadBreak(result);
}

// End the deadhead trip
export async function endDeadheadTrip(data: {
  tripId: string;
  endOdometer: number;
  endLocation: Location;
}): Promise<DeadheadTrip> {
  const totalKm = data.endOdometer - (await queryOne<any>(`
    SELECT start_odometer FROM deadhead_trips WHERE id = $1
  `, [data.tripId])).start_odometer;

  const result = await queryOne<any>(`
    UPDATE deadhead_trips
    SET 
      end_time = NOW(),
      end_odometer = $2,
      total_km = $3,
      end_latitude = $4,
      end_longitude = $5,
      end_address = $6,
      travel_minutes = EXTRACT(EPOCH FROM (NOW() - start_time)) / 60,
      is_complete = true
    WHERE id = $1
    RETURNING *
  `, [
    data.tripId,
    data.endOdometer,
    totalKm,
    data.endLocation.latitude,
    data.endLocation.longitude,
    data.endLocation.address
  ]);

  const trip = mapDeadheadTrip(result);
  
  // Load breaks
  const breaks = await query<any>(`
    SELECT * FROM deadhead_breaks
    WHERE trip_id = $1
    ORDER BY start_time ASC
  `, [trip.id]);

  trip.breaks = breaks.map(mapDeadheadBreak);
  
  return trip;
}

// Get all completed trips for a company (for invoicing)
export async function getCompletedTrips(
  companyId: string,
  options?: { startDate?: string; endDate?: string; userId?: string }
): Promise<DeadheadTrip[]> {
  let sql = `
    SELECT dt.*, u.first_name || ' ' || u.last_name as user_name
    FROM deadhead_trips dt
    JOIN users u ON dt.user_id = u.id
    WHERE dt.company_id = $1 AND dt.is_complete = true
  `;
  const params: any[] = [companyId];
  let paramIndex = 2;

  if (options?.startDate) {
    sql += ` AND dt.start_time >= $${paramIndex}`;
    params.push(options.startDate);
    paramIndex++;
  }

  if (options?.endDate) {
    sql += ` AND dt.start_time <= $${paramIndex}`;
    params.push(options.endDate);
    paramIndex++;
  }

  if (options?.userId) {
    sql += ` AND dt.user_id = $${paramIndex}`;
    params.push(options.userId);
    paramIndex++;
  }

  sql += ` ORDER BY dt.start_time DESC`;

  const results = await query<any>(sql, params);
  const trips = results.map(mapDeadheadTrip);

  // Load breaks for each trip
  for (const trip of trips) {
    const breaks = await query<any>(`
      SELECT * FROM deadhead_breaks
      WHERE trip_id = $1
      ORDER BY start_time ASC
    `, [trip.id]);
    
    trip.breaks = breaks.map(mapDeadheadBreak);
  }

  return trips;
}

// Get active break for a trip
export async function getActiveBreak(tripId: string): Promise<DeadheadBreak | null> {
  const result = await queryOne<any>(`
    SELECT * FROM deadhead_breaks
    WHERE trip_id = $1 AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `, [tripId]);

  return result ? mapDeadheadBreak(result) : null;
}

// Helper functions to map database rows to TypeScript types
function mapDeadheadTrip(row: any): DeadheadTrip {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    sessionId: row.session_id,
    truckRego: row.truck_rego,
    trailerRego: row.trailer_rego,
    startOdometer: row.start_odometer,
    endOdometer: row.end_odometer,
    totalKm: row.total_km,
    startTime: row.start_time,
    endTime: row.end_time,
    startLocation: {
      latitude: parseFloat(row.start_latitude),
      longitude: parseFloat(row.start_longitude),
      address: row.start_address
    },
    endLocation: row.end_latitude ? {
      latitude: parseFloat(row.end_latitude),
      longitude: parseFloat(row.end_longitude),
      address: row.end_address
    } : undefined,
    breaks: [], // Loaded separately
    totalBreakMinutes: row.total_break_minutes || 0,
    travelMinutes: row.travel_minutes || 0,
    isComplete: row.is_complete,
    createdAt: row.created_at,
    userName: row.user_name
  };
}

function mapDeadheadBreak(row: any): DeadheadBreak {
  return {
    id: row.id,
    tripId: row.trip_id,
    startTime: row.start_time,
    endTime: row.end_time,
    startLocation: {
      latitude: parseFloat(row.start_latitude),
      longitude: parseFloat(row.start_longitude),
      address: row.start_address
    },
    endLocation: row.end_latitude ? {
      latitude: parseFloat(row.end_latitude),
      longitude: parseFloat(row.end_longitude),
      address: row.end_address
    } : undefined,
    durationMinutes: row.duration_minutes || 0
  };
}
