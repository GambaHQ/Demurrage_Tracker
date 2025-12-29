// User session service
import { query, queryOne } from '../config/database';
import { UserSession, Vehicle } from '../types';

// Create a new session for user login
export async function createSession(
  userId: string,
  truckRego?: string,
  trailerRego?: string
): Promise<UserSession> {
  // End any existing active sessions for this user
  await query(`
    UPDATE user_sessions SET ended_at = NOW() 
    WHERE user_id = $1 AND ended_at IS NULL
  `, [userId]);
  
  // Create new session
  const result = await queryOne<any>(`
    INSERT INTO user_sessions (user_id, truck_rego, trailer_rego)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [userId, truckRego || null, trailerRego || null]);
  
  return {
    id: result.id,
    userId: result.user_id,
    vehicleId: result.vehicle_id,
    truckRego: result.truck_rego,
    trailerRego: result.trailer_rego,
    startedAt: result.started_at,
    endedAt: result.ended_at,
  };
}

// End session
export async function endSession(sessionId: string): Promise<void> {
  await query(`
    UPDATE user_sessions SET ended_at = NOW() WHERE id = $1
  `, [sessionId]);
}

// Get active session for user
export async function getActiveSession(userId: string): Promise<UserSession | null> {
  const result = await queryOne<any>(`
    SELECT * FROM user_sessions 
    WHERE user_id = $1 AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `, [userId]);
  
  if (!result) return null;
  
  return {
    id: result.id,
    userId: result.user_id,
    vehicleId: result.vehicle_id,
    truckRego: result.truck_rego,
    trailerRego: result.trailer_rego,
    startedAt: result.started_at,
    endedAt: result.ended_at,
  };
}

// Update session vehicle
export async function updateSessionVehicle(
  sessionId: string,
  truckRego: string,
  trailerRego?: string
): Promise<UserSession | null> {
  const result = await queryOne<any>(`
    UPDATE user_sessions 
    SET truck_rego = $2, trailer_rego = $3
    WHERE id = $1
    RETURNING *
  `, [sessionId, truckRego, trailerRego || null]);
  
  if (!result) return null;
  
  return {
    id: result.id,
    userId: result.user_id,
    vehicleId: result.vehicle_id,
    truckRego: result.truck_rego,
    trailerRego: result.trailer_rego,
    startedAt: result.started_at,
    endedAt: result.ended_at,
  };
}

// Get company vehicles
export async function getCompanyVehicles(companyId: string): Promise<Vehicle[]> {
  const results = await query<any>(`
    SELECT * FROM vehicles 
    WHERE company_id = $1 AND is_active = true
    ORDER BY truck_rego
  `, [companyId]);
  
  return results.map(r => ({
    id: r.id,
    companyId: r.company_id,
    truckRego: r.truck_rego,
    trailerRego: r.trailer_rego,
    description: r.description,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

// Add vehicle to company
export async function addVehicle(
  companyId: string,
  truckRego: string,
  trailerRego?: string,
  description?: string
): Promise<Vehicle> {
  const result = await queryOne<any>(`
    INSERT INTO vehicles (company_id, truck_rego, trailer_rego, description)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (company_id, truck_rego) 
    DO UPDATE SET trailer_rego = EXCLUDED.trailer_rego, description = EXCLUDED.description
    RETURNING *
  `, [companyId, truckRego.toUpperCase(), trailerRego?.toUpperCase() || null, description || null]);
  
  return {
    id: result.id,
    companyId: result.company_id,
    truckRego: result.truck_rego,
    trailerRego: result.trailer_rego,
    description: result.description,
    isActive: result.is_active,
    createdAt: result.created_at,
  };
}

// Update vehicle
export async function updateVehicle(
  vehicleId: string,
  updates: Partial<Pick<Vehicle, 'truckRego' | 'trailerRego' | 'description' | 'isActive'>>
): Promise<Vehicle | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.truckRego !== undefined) {
    setClauses.push(`truck_rego = $${paramIndex++}`);
    values.push(updates.truckRego.toUpperCase());
  }
  if (updates.trailerRego !== undefined) {
    setClauses.push(`trailer_rego = $${paramIndex++}`);
    values.push(updates.trailerRego?.toUpperCase() || null);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(updates.isActive);
  }
  
  if (setClauses.length === 0) return null;
  
  values.push(vehicleId);
  
  const result = await queryOne<any>(`
    UPDATE vehicles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
  `, values);
  
  if (!result) return null;
  
  return {
    id: result.id,
    companyId: result.company_id,
    truckRego: result.truck_rego,
    trailerRego: result.trailer_rego,
    description: result.description,
    isActive: result.is_active,
    createdAt: result.created_at,
  };
}

// Delete vehicle
export async function deleteVehicle(vehicleId: string): Promise<void> {
  await query(`
    UPDATE vehicles SET is_active = false WHERE id = $1
  `, [vehicleId]);
}
