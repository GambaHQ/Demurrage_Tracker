// Database connection and pool
import { Pool } from 'pg';
import { config } from './index';

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Create tables
    await client.query(`
      -- Companies table
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        abn VARCHAR(20),
        address TEXT,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50),
        hourly_rate DECIMAL(10, 2) DEFAULT 0,
        demurrage_threshold_minutes INTEGER DEFAULT 50,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'driver')),
        is_active BOOLEAN DEFAULT true,
        password_reset_token VARCHAR(10),
        password_reset_expires TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email, company_id)
      );
      
      -- Create index for email lookups
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

      -- Vehicles table
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        truck_rego VARCHAR(20) NOT NULL,
        trailer_rego VARCHAR(20),
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, truck_rego)
      );
      
      CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles(company_id);

      -- User sessions table (tracks login sessions with vehicle)
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vehicle_id UUID REFERENCES vehicles(id),
        truck_rego VARCHAR(20),
        trailer_rego VARCHAR(20),
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP WITH TIME ZONE
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

      -- Stop events table
      CREATE TABLE IF NOT EXISTS stop_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES user_sessions(id),
        vehicle_id UUID REFERENCES vehicles(id),
        truck_rego VARCHAR(20),
        trailer_rego VARCHAR(20),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        duration_minutes INTEGER DEFAULT 0,
        start_latitude DECIMAL(10, 8) NOT NULL,
        start_longitude DECIMAL(11, 8) NOT NULL,
        start_address TEXT,
        end_latitude DECIMAL(10, 8),
        end_longitude DECIMAL(11, 8),
        end_address TEXT,
        reason VARCHAR(50),
        notes TEXT,
        photos TEXT[], -- Array of photo URLs/paths
        is_demurrage BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_stop_events_company ON stop_events(company_id);
      CREATE INDEX IF NOT EXISTS idx_stop_events_user ON stop_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_stop_events_date ON stop_events(start_time);

      -- Weekly demurrage summary
      CREATE TABLE IF NOT EXISTS weekly_demurrage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,
        total_minutes INTEGER DEFAULT 0,
        event_count INTEGER DEFAULT 0,
        invoice_generated BOOLEAN DEFAULT false,
        invoice_sent BOOLEAN DEFAULT false,
        invoice_path TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, week_start_date)
      );
      
      CREATE INDEX IF NOT EXISTS idx_weekly_demurrage_company ON weekly_demurrage(company_id);

      -- Invoices table
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        weekly_demurrage_id UUID REFERENCES weekly_demurrage(id),
        invoice_number VARCHAR(50) NOT NULL,
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE,
        recipient_email VARCHAR(255) NOT NULL,
        total_hours DECIMAL(10, 2) NOT NULL,
        total_minutes INTEGER NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        gst_amount DECIMAL(10, 2) NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        pdf_path TEXT,
        UNIQUE(company_id, invoice_number)
      );
      
      CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);

      -- Invitations table
      CREATE TABLE IF NOT EXISTS invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'driver')),
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        invited_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
      CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
    `);
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to run queries
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

// Helper for single result queries
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}
