// Company service
import { query, queryOne } from '../config/database';
import { Company } from '../types';

// Get company by ID
export async function getCompanyById(companyId: string): Promise<Company | null> {
  const result = await queryOne<any>(`
    SELECT * FROM companies WHERE id = $1
  `, [companyId]);
  
  if (!result) return null;
  
  return mapCompany(result);
}

// Get company settings
export async function getCompanySettings(companyId: string): Promise<{
  hourlyRate: number;
  demurrageThresholdMinutes: number;
  email: string;
} | null> {
  const result = await queryOne<any>(`
    SELECT hourly_rate, demurrage_threshold_minutes, email 
    FROM companies WHERE id = $1
  `, [companyId]);
  
  if (!result) return null;
  
  return {
    hourlyRate: parseFloat(result.hourly_rate) || 0,
    demurrageThresholdMinutes: result.demurrage_threshold_minutes || 50,
    email: result.email,
  };
}

// Update company
export async function updateCompany(
  companyId: string,
  updates: Partial<Pick<Company, 'name' | 'abn' | 'address' | 'phone' | 'hourlyRate' | 'demurrageThresholdMinutes'>>
): Promise<Company | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.abn !== undefined) {
    setClauses.push(`abn = $${paramIndex++}`);
    values.push(updates.abn);
  }
  if (updates.address !== undefined) {
    setClauses.push(`address = $${paramIndex++}`);
    values.push(updates.address);
  }
  if (updates.phone !== undefined) {
    setClauses.push(`phone = $${paramIndex++}`);
    values.push(updates.phone);
  }
  if (updates.hourlyRate !== undefined) {
    setClauses.push(`hourly_rate = $${paramIndex++}`);
    values.push(updates.hourlyRate);
  }
  if (updates.demurrageThresholdMinutes !== undefined) {
    setClauses.push(`demurrage_threshold_minutes = $${paramIndex++}`);
    values.push(updates.demurrageThresholdMinutes);
  }
  
  if (setClauses.length === 0) return null;
  
  setClauses.push(`updated_at = NOW()`);
  values.push(companyId);
  
  const result = await queryOne<any>(`
    UPDATE companies SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
  `, values);
  
  if (!result) return null;
  return mapCompany(result);
}

// Helper to map database row to Company
function mapCompany(row: any): Company {
  return {
    id: row.id,
    name: row.name,
    abn: row.abn,
    address: row.address,
    email: row.email,
    phone: row.phone,
    hourlyRate: parseFloat(row.hourly_rate) || 0,
    demurrageThresholdMinutes: row.demurrage_threshold_minutes || 50,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
