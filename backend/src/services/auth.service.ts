// Authentication service
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { config } from '../config';
import { 
  User, 
  Company, 
  RegisterCompanyRequest, 
  InviteUserRequest,
  Invitation,
  UserRole 
} from '../types';

const SALT_ROUNDS = 12;

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Find user by email (across all companies)
export async function findUserByEmail(email: string): Promise<(User & { companyName: string }) | null> {
  const result = await queryOne<any>(`
    SELECT u.*, c.name as company_name 
    FROM users u 
    JOIN companies c ON u.company_id = c.id 
    WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true
  `, [email]);
  
  if (!result) return null;
  
  return {
    id: result.id,
    companyId: result.company_id,
    email: result.email,
    passwordHash: result.password_hash,
    firstName: result.first_name,
    lastName: result.last_name,
    role: result.role as UserRole,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    companyName: result.company_name,
  };
}

// Find user by ID
export async function findUserById(id: string): Promise<User | null> {
  const result = await queryOne<any>(`
    SELECT * FROM users WHERE id = $1
  `, [id]);
  
  if (!result) return null;
  
  return {
    id: result.id,
    companyId: result.company_id,
    email: result.email,
    passwordHash: result.password_hash,
    firstName: result.first_name,
    lastName: result.last_name,
    role: result.role as UserRole,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

// Register a new company with owner
export async function registerCompany(data: RegisterCompanyRequest): Promise<{ company: Company; user: User }> {
  // Check if email already exists
  const existingUser = await findUserByEmail(data.email);
  if (existingUser) {
    throw new Error('Email already registered');
  }
  
  // Check if company email exists
  const existingCompany = await queryOne<any>(`
    SELECT id FROM companies WHERE LOWER(email) = LOWER($1)
  `, [data.email]);
  
  if (existingCompany) {
    throw new Error('Company email already registered');
  }
  
  // Hash password
  const passwordHash = await hashPassword(data.password);
  
  // Create company
  const companyResult = await queryOne<any>(`
    INSERT INTO companies (name, email, abn, phone)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [data.companyName, data.email, data.abn || null, data.phone || null]);
  
  // Create owner user
  const userResult = await queryOne<any>(`
    INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, $4, $5, 'owner')
    RETURNING *
  `, [companyResult.id, data.email, passwordHash, data.firstName, data.lastName]);
  
  const company: Company = {
    id: companyResult.id,
    name: companyResult.name,
    email: companyResult.email,
    abn: companyResult.abn,
    phone: companyResult.phone,
    address: companyResult.address,
    hourlyRate: parseFloat(companyResult.hourly_rate) || 0,
    demurrageThresholdMinutes: companyResult.demurrage_threshold_minutes,
    createdAt: companyResult.created_at,
    updatedAt: companyResult.updated_at,
  };
  
  const user: User = {
    id: userResult.id,
    companyId: userResult.company_id,
    email: userResult.email,
    passwordHash: userResult.password_hash,
    firstName: userResult.first_name,
    lastName: userResult.last_name,
    role: userResult.role,
    isActive: userResult.is_active,
    createdAt: userResult.created_at,
    updatedAt: userResult.updated_at,
  };
  
  return { company, user };
}

// Create invitation for new user
export async function createInvitation(
  companyId: string, 
  invitedBy: string, 
  data: InviteUserRequest
): Promise<Invitation> {
  // Check if user already exists in company
  const existingUser = await queryOne<any>(`
    SELECT id FROM users 
    WHERE LOWER(email) = LOWER($1) AND company_id = $2
  `, [data.email, companyId]);
  
  if (existingUser) {
    throw new Error('User already exists in this company');
  }
  
  // Check for pending invitation
  const existingInvite = await queryOne<any>(`
    SELECT id FROM invitations 
    WHERE LOWER(email) = LOWER($1) AND company_id = $2 
    AND expires_at > NOW() AND used_at IS NULL
  `, [data.email, companyId]);
  
  if (existingInvite) {
    throw new Error('Pending invitation already exists for this email');
  }
  
  // Generate invitation token
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.invitation.expiresInDays);
  
  const result = await queryOne<any>(`
    INSERT INTO invitations (company_id, email, role, token, expires_at, invited_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [companyId, data.email, data.role, token, expiresAt, invitedBy]);
  
  return {
    id: result.id,
    companyId: result.company_id,
    email: result.email,
    role: result.role,
    token: result.token,
    expiresAt: result.expires_at,
    usedAt: result.used_at,
    invitedBy: result.invited_by,
    createdAt: result.created_at,
  };
}

// Accept invitation and create user
export async function acceptInvitation(
  token: string, 
  password: string, 
  firstName: string, 
  lastName: string
): Promise<User> {
  // Find valid invitation
  const invitation = await queryOne<any>(`
    SELECT * FROM invitations 
    WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL
  `, [token]);
  
  if (!invitation) {
    throw new Error('Invalid or expired invitation');
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Create user
  const userResult = await queryOne<any>(`
    INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [invitation.company_id, invitation.email, passwordHash, firstName, lastName, invitation.role]);
  
  // Mark invitation as used
  await query(`
    UPDATE invitations SET used_at = NOW() WHERE id = $1
  `, [invitation.id]);
  
  return {
    id: userResult.id,
    companyId: userResult.company_id,
    email: userResult.email,
    passwordHash: userResult.password_hash,
    firstName: userResult.first_name,
    lastName: userResult.last_name,
    role: userResult.role,
    isActive: userResult.is_active,
    createdAt: userResult.created_at,
    updatedAt: userResult.updated_at,
  };
}

// Get invitation by token
export async function getInvitationByToken(token: string): Promise<(Invitation & { companyName: string }) | null> {
  const result = await queryOne<any>(`
    SELECT i.*, c.name as company_name 
    FROM invitations i
    JOIN companies c ON i.company_id = c.id
    WHERE i.token = $1 AND i.expires_at > NOW() AND i.used_at IS NULL
  `, [token]);
  
  if (!result) return null;
  
  return {
    id: result.id,
    companyId: result.company_id,
    email: result.email,
    role: result.role,
    token: result.token,
    expiresAt: result.expires_at,
    usedAt: result.used_at,
    invitedBy: result.invited_by,
    createdAt: result.created_at,
    companyName: result.company_name,
  };
}

// Get all users in a company
export async function getCompanyUsers(companyId: string): Promise<User[]> {
  const results = await query<any>(`
    SELECT * FROM users WHERE company_id = $1 ORDER BY created_at DESC
  `, [companyId]);
  
  return results.map(r => ({
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    passwordHash: r.password_hash,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// Get pending invitations for a company
export async function getPendingInvitations(companyId: string): Promise<Invitation[]> {
  const results = await query<any>(`
    SELECT * FROM invitations 
    WHERE company_id = $1 AND expires_at > NOW() AND used_at IS NULL
    ORDER BY created_at DESC
  `, [companyId]);
  
  return results.map(r => ({
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    role: r.role,
    token: r.token,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    invitedBy: r.invited_by,
    createdAt: r.created_at,
  }));
}

// Update user
export async function updateUser(
  userId: string, 
  updates: Partial<Pick<User, 'firstName' | 'lastName' | 'role' | 'isActive'>>
): Promise<User | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.firstName !== undefined) {
    setClauses.push(`first_name = $${paramIndex++}`);
    values.push(updates.firstName);
  }
  if (updates.lastName !== undefined) {
    setClauses.push(`last_name = $${paramIndex++}`);
    values.push(updates.lastName);
  }
  if (updates.role !== undefined) {
    setClauses.push(`role = $${paramIndex++}`);
    values.push(updates.role);
  }
  if (updates.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(updates.isActive);
  }
  
  if (setClauses.length === 0) return null;
  
  setClauses.push(`updated_at = NOW()`);
  values.push(userId);
  
  const result = await queryOne<any>(`
    UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *
  `, values);
  
  if (!result) return null;
  
  return {
    id: result.id,
    companyId: result.company_id,
    email: result.email,
    passwordHash: result.password_hash,
    firstName: result.first_name,
    lastName: result.last_name,
    role: result.role,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}
