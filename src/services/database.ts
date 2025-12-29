// Database service with encrypted SQLite storage
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { encrypt, decrypt, generateSecureId } from '../utils/encryption';
import { StopEvent, WeeklyDemurrage, AppSettings, Invoice } from '../types';
import { getWeekStartISO, getWeekEndISO } from '../utils/dateUtils';

let db: SQLite.SQLiteDatabase | null = null;
let isWebPlatform = Platform.OS === 'web';

// In-memory storage for web platform
let webStorage: {
  stopEvents: Map<string, { encrypted_data: string; week_start_date: string; is_demurrage: number; created_at: number }>;
  weeklyDemurrage: Map<string, { id: string; week_start_date: string; week_end_date: string; total_demurrage_minutes: number; event_count: number; invoice_generated: number; invoice_sent: number; invoice_path: string | null }>;
  invoices: Map<string, { id: string; weekly_demurrage_id: string; encrypted_data: string; generated_at: number; sent_at: number | null }>;
  settings: { encrypted_data: string } | null;
} = {
  stopEvents: new Map(),
  weeklyDemurrage: new Map(),
  invoices: new Map(),
  settings: null,
};

// Load web storage from localStorage
function loadWebStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem('demurrage_web_db');
      if (saved) {
        const parsed = JSON.parse(saved);
        webStorage.stopEvents = new Map(parsed.stopEvents || []);
        webStorage.weeklyDemurrage = new Map(parsed.weeklyDemurrage || []);
        webStorage.invoices = new Map(parsed.invoices || []);
        webStorage.settings = parsed.settings || null;
      }
    } catch (e) {
      console.warn('Failed to load web storage:', e);
    }
  }
}

// Save web storage to localStorage
function saveWebStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const toSave = {
        stopEvents: Array.from(webStorage.stopEvents.entries()),
        weeklyDemurrage: Array.from(webStorage.weeklyDemurrage.entries()),
        invoices: Array.from(webStorage.invoices.entries()),
        settings: webStorage.settings,
      };
      window.localStorage.setItem('demurrage_web_db', JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save web storage:', e);
    }
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  recipientEmail: '',
  demurrageThresholdMinutes: 1, // Changed to 1 min for testing (default: 50)
  autoSendInvoice: true,
  trackingEnabled: true,
  biometricEnabled: false,
  hourlyRate: 0,
  companyName: '',
  companyAddress: '',
};

/**
 * Initialize the database and create tables
 */
export async function initializeDatabase(): Promise<void> {
  try {
    if (isWebPlatform) {
      // Web: Use in-memory storage with localStorage persistence
      loadWebStorage();
      console.log('Web database initialized (localStorage)');
    } else {
      // Native: Use SQLite
      db = await SQLite.openDatabaseAsync('demurrage_encrypted.db');
      
      // Create tables
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS stop_events (
          id TEXT PRIMARY KEY,
          encrypted_data TEXT NOT NULL,
          week_start_date TEXT NOT NULL,
          is_demurrage INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS weekly_demurrage (
          id TEXT PRIMARY KEY,
          week_start_date TEXT UNIQUE NOT NULL,
          week_end_date TEXT NOT NULL,
          total_demurrage_minutes INTEGER DEFAULT 0,
          event_count INTEGER DEFAULT 0,
          invoice_generated INTEGER DEFAULT 0,
          invoice_sent INTEGER DEFAULT 0,
          invoice_path TEXT
        );
        
        CREATE TABLE IF NOT EXISTS invoices (
          id TEXT PRIMARY KEY,
          weekly_demurrage_id TEXT NOT NULL,
          encrypted_data TEXT NOT NULL,
          generated_at INTEGER NOT NULL,
          sent_at INTEGER,
          FOREIGN KEY (weekly_demurrage_id) REFERENCES weekly_demurrage(id)
        );
        
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          encrypted_data TEXT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_stop_events_week ON stop_events(week_start_date);
        CREATE INDEX IF NOT EXISTS idx_stop_events_demurrage ON stop_events(is_demurrage);
      `);
    }
    
    // Initialize default settings if not exists
    try {
      const settings = await getSettings();
      if (!settings) {
        await saveSettings(DEFAULT_SETTINGS);
      }
    } catch (settingsError) {
      // If settings are corrupted (e.g., encryption key changed), reset them
      console.warn('Settings corrupted, resetting to defaults:', settingsError);
      if (isWebPlatform) {
        // Clear corrupted web storage and start fresh
        webStorage.settings = null;
        webStorage.stopEvents.clear();
        webStorage.weeklyDemurrage.clear();
        webStorage.invoices.clear();
        saveWebStorage();
      }
      await saveSettings(DEFAULT_SETTINGS);
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Get the database instance
 */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Ensure database is ready, re-initialize if needed
 */
async function ensureDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    console.log('Database not initialized, initializing now...');
    await initializeDatabase();
  }
  return db!;
}

// ========== Stop Events ==========

/**
 * Save a new stop event
 */
export async function saveStopEvent(event: StopEvent): Promise<void> {
  const encryptedData = encrypt(JSON.stringify(event));
  
  if (isWebPlatform) {
    webStorage.stopEvents.set(event.id, {
      encrypted_data: encryptedData,
      week_start_date: event.weekStartDate,
      is_demurrage: event.isDemurrage ? 1 : 0,
      created_at: event.startTime,
    });
    saveWebStorage();
  } else {
    try {
      const database = await ensureDb();
      await database.runAsync(
        `INSERT OR REPLACE INTO stop_events (id, encrypted_data, week_start_date, is_demurrage, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [event.id, encryptedData, event.weekStartDate, event.isDemurrage ? 1 : 0, event.startTime]
      );
    } catch (error) {
      console.error('saveStopEvent database error:', error);
      // Try to reinitialize and retry once
      db = null;
      const database = await ensureDb();
      await database.runAsync(
        `INSERT OR REPLACE INTO stop_events (id, encrypted_data, week_start_date, is_demurrage, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [event.id, encryptedData, event.weekStartDate, event.isDemurrage ? 1 : 0, event.startTime]
      );
    }
  }
}

/**
 * Update an existing stop event
 */
export async function updateStopEvent(event: StopEvent): Promise<void> {
  const encryptedData = encrypt(JSON.stringify(event));
  
  if (isWebPlatform) {
    const existing = webStorage.stopEvents.get(event.id);
    if (existing) {
      existing.encrypted_data = encryptedData;
      existing.is_demurrage = event.isDemurrage ? 1 : 0;
      saveWebStorage();
    }
  } else {
    try {
      const database = await ensureDb();
      await database.runAsync(
        `UPDATE stop_events SET encrypted_data = ?, is_demurrage = ? WHERE id = ?`,
        [encryptedData, event.isDemurrage ? 1 : 0, event.id]
      );
    } catch (error) {
      console.error('updateStopEvent database error:', error);
      // Try to reinitialize and retry once
      db = null;
      const database = await ensureDb();
      await database.runAsync(
        `UPDATE stop_events SET encrypted_data = ?, is_demurrage = ? WHERE id = ?`,
        [encryptedData, event.isDemurrage ? 1 : 0, event.id]
      );
    }
  }
}

/**
 * Get a stop event by ID
 */
export async function getStopEvent(id: string): Promise<StopEvent | null> {
  if (isWebPlatform) {
    const result = webStorage.stopEvents.get(id);
    if (!result) return null;
    return JSON.parse(decrypt(result.encrypted_data)) as StopEvent;
  } else {
    const database = getDb();
    const result = await database.getFirstAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM stop_events WHERE id = ?',
      [id]
    );
    
    if (!result) return null;
    return JSON.parse(decrypt(result.encrypted_data)) as StopEvent;
  }
}

/**
 * Get all stop events for a specific week
 */
export async function getStopEventsByWeek(weekStartDate: string): Promise<StopEvent[]> {
  if (isWebPlatform) {
    const results = Array.from(webStorage.stopEvents.values())
      .filter(e => e.week_start_date === weekStartDate)
      .sort((a, b) => b.created_at - a.created_at);
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  } else {
    const database = getDb();
    const results = await database.getAllAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM stop_events WHERE week_start_date = ? ORDER BY created_at DESC',
      [weekStartDate]
    );
    
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  }
}

/**
 * Get all demurrage events for a specific week
 */
export async function getDemurrageEventsByWeek(weekStartDate: string): Promise<StopEvent[]> {
  if (isWebPlatform) {
    const results = Array.from(webStorage.stopEvents.values())
      .filter(e => e.week_start_date === weekStartDate && e.is_demurrage === 1)
      .sort((a, b) => b.created_at - a.created_at);
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  } else {
    const database = getDb();
    const results = await database.getAllAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM stop_events WHERE week_start_date = ? AND is_demurrage = 1 ORDER BY created_at DESC',
      [weekStartDate]
    );
    
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  }
}

/**
 * Get the current (in-progress) stop event if any
 */
export async function getCurrentStopEvent(): Promise<StopEvent | null> {
  const weekStartDate = getWeekStartISO();
  
  if (isWebPlatform) {
    const results = Array.from(webStorage.stopEvents.values())
      .filter(e => e.week_start_date === weekStartDate)
      .sort((a, b) => b.created_at - a.created_at);
    
    if (results.length === 0) return null;
    
    const event = JSON.parse(decrypt(results[0].encrypted_data)) as StopEvent;
    return event.endTime === null ? event : null;
  } else {
    const database = getDb();
    const results = await database.getAllAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM stop_events WHERE week_start_date = ? ORDER BY created_at DESC LIMIT 1',
      [weekStartDate]
    );
    
    if (results.length === 0) return null;
    
    const event = JSON.parse(decrypt(results[0].encrypted_data)) as StopEvent;
    return event.endTime === null ? event : null;
  }
}

/**
 * Get recent stop events
 */
export async function getRecentStopEvents(limit: number = 10): Promise<StopEvent[]> {
  if (isWebPlatform) {
    const results = Array.from(webStorage.stopEvents.values())
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  } else {
    const database = getDb();
    const results = await database.getAllAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM stop_events ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    
    return results.map(row => JSON.parse(decrypt(row.encrypted_data)) as StopEvent);
  }
}

// ========== Weekly Demurrage ==========

/**
 * Get or create weekly demurrage record
 */
export async function getOrCreateWeeklyDemurrage(weekStartDate?: string): Promise<WeeklyDemurrage> {
  const start = weekStartDate || getWeekStartISO();
  const end = getWeekEndISO(new Date(start));
  
  if (isWebPlatform) {
    let result = webStorage.weeklyDemurrage.get(start);
    
    if (!result) {
      const id = generateSecureId();
      result = {
        id,
        week_start_date: start,
        week_end_date: end,
        total_demurrage_minutes: 0,
        event_count: 0,
        invoice_generated: 0,
        invoice_sent: 0,
        invoice_path: null,
      };
      webStorage.weeklyDemurrage.set(start, result);
      saveWebStorage();
    }
    
    return {
      id: result.id,
      weekStartDate: result.week_start_date,
      weekEndDate: result.week_end_date,
      totalDemurrageMinutes: result.total_demurrage_minutes,
      eventCount: result.event_count,
      invoiceGenerated: result.invoice_generated === 1,
      invoiceSent: result.invoice_sent === 1,
      invoicePath: result.invoice_path || undefined,
    };
  } else {
    const database = getDb();
    let result = await database.getFirstAsync<{
      id: string;
      week_start_date: string;
      week_end_date: string;
      total_demurrage_minutes: number;
      event_count: number;
      invoice_generated: number;
      invoice_sent: number;
      invoice_path: string | null;
    }>('SELECT * FROM weekly_demurrage WHERE week_start_date = ?', [start]);
    
    if (!result) {
      const id = generateSecureId();
      await database.runAsync(
        `INSERT INTO weekly_demurrage (id, week_start_date, week_end_date) VALUES (?, ?, ?)`,
        [id, start, end]
      );
      
      result = {
        id,
        week_start_date: start,
        week_end_date: end,
        total_demurrage_minutes: 0,
        event_count: 0,
        invoice_generated: 0,
        invoice_sent: 0,
        invoice_path: null,
      };
    }
    
    return {
      id: result.id,
      weekStartDate: result.week_start_date,
      weekEndDate: result.week_end_date,
      totalDemurrageMinutes: result.total_demurrage_minutes,
      eventCount: result.event_count,
      invoiceGenerated: result.invoice_generated === 1,
      invoiceSent: result.invoice_sent === 1,
      invoicePath: result.invoice_path || undefined,
    };
  }
}

/**
 * Update weekly demurrage totals
 */
export async function updateWeeklyDemurrage(
  weekStartDate: string,
  totalMinutes: number,
  eventCount: number
): Promise<void> {
  if (isWebPlatform) {
    const existing = webStorage.weeklyDemurrage.get(weekStartDate);
    if (existing) {
      existing.total_demurrage_minutes = totalMinutes;
      existing.event_count = eventCount;
      saveWebStorage();
    }
  } else {
    const database = getDb();
    await database.runAsync(
      `UPDATE weekly_demurrage SET total_demurrage_minutes = ?, event_count = ? WHERE week_start_date = ?`,
      [totalMinutes, eventCount, weekStartDate]
    );
  }
}

/**
 * Mark invoice as generated
 */
export async function markInvoiceGenerated(weekStartDate: string, invoicePath: string): Promise<void> {
  if (isWebPlatform) {
    const existing = webStorage.weeklyDemurrage.get(weekStartDate);
    if (existing) {
      existing.invoice_generated = 1;
      existing.invoice_path = invoicePath;
      saveWebStorage();
    }
  } else {
    const database = getDb();
    await database.runAsync(
      `UPDATE weekly_demurrage SET invoice_generated = 1, invoice_path = ? WHERE week_start_date = ?`,
      [invoicePath, weekStartDate]
    );
  }
}

/**
 * Mark invoice as sent
 */
export async function markInvoiceSent(weekStartDate: string): Promise<void> {
  if (isWebPlatform) {
    const existing = webStorage.weeklyDemurrage.get(weekStartDate);
    if (existing) {
      existing.invoice_sent = 1;
      saveWebStorage();
    }
  } else {
    const database = getDb();
    await database.runAsync(
      `UPDATE weekly_demurrage SET invoice_sent = 1 WHERE week_start_date = ?`,
      [weekStartDate]
    );
  }
}

/**
 * Get all weekly demurrage records
 */
export async function getAllWeeklyDemurrage(): Promise<WeeklyDemurrage[]> {
  if (isWebPlatform) {
    const results = Array.from(webStorage.weeklyDemurrage.values())
      .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
    
    return results.map(row => ({
      id: row.id,
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      totalDemurrageMinutes: row.total_demurrage_minutes,
      eventCount: row.event_count,
      invoiceGenerated: row.invoice_generated === 1,
      invoiceSent: row.invoice_sent === 1,
      invoicePath: row.invoice_path || undefined,
    }));
  } else {
    const database = getDb();
    const results = await database.getAllAsync<{
      id: string;
      week_start_date: string;
      week_end_date: string;
      total_demurrage_minutes: number;
      event_count: number;
      invoice_generated: number;
      invoice_sent: number;
      invoice_path: string | null;
    }>('SELECT * FROM weekly_demurrage ORDER BY week_start_date DESC');
    
    return results.map(row => ({
      id: row.id,
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      totalDemurrageMinutes: row.total_demurrage_minutes,
      eventCount: row.event_count,
      invoiceGenerated: row.invoice_generated === 1,
      invoiceSent: row.invoice_sent === 1,
      invoicePath: row.invoice_path || undefined,
    }));
  }
}

// ========== Settings ==========

/**
 * Get app settings
 */
export async function getSettings(): Promise<AppSettings | null> {
  if (isWebPlatform) {
    if (!webStorage.settings) return null;
    return JSON.parse(decrypt(webStorage.settings.encrypted_data)) as AppSettings;
  } else {
    const database = getDb();
    const result = await database.getFirstAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM settings WHERE id = 1'
    );
    
    if (!result) return null;
    return JSON.parse(decrypt(result.encrypted_data)) as AppSettings;
  }
}

/**
 * Save app settings
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const encryptedData = encrypt(JSON.stringify(settings));
  
  if (isWebPlatform) {
    webStorage.settings = { encrypted_data: encryptedData };
    saveWebStorage();
  } else {
    const database = getDb();
    await database.runAsync(
      `INSERT OR REPLACE INTO settings (id, encrypted_data) VALUES (1, ?)`,
      [encryptedData]
    );
  }
}

// ========== Invoices ==========

/**
 * Save an invoice
 */
export async function saveInvoice(invoice: Invoice): Promise<void> {
  const encryptedData = encrypt(JSON.stringify(invoice));
  
  if (isWebPlatform) {
    webStorage.invoices.set(invoice.id, {
      id: invoice.id,
      weekly_demurrage_id: invoice.weeklyDemurrageId,
      encrypted_data: encryptedData,
      generated_at: invoice.generatedAt,
      sent_at: invoice.sentAt || null,
    });
    saveWebStorage();
  } else {
    const database = getDb();
    await database.runAsync(
      `INSERT INTO invoices (id, weekly_demurrage_id, encrypted_data, generated_at, sent_at)
       VALUES (?, ?, ?, ?, ?)`,
      [invoice.id, invoice.weeklyDemurrageId, encryptedData, invoice.generatedAt, invoice.sentAt]
    );
  }
}

/**
 * Get invoice by weekly demurrage ID
 */
export async function getInvoiceByWeek(weeklyDemurrageId: string): Promise<Invoice | null> {
  if (isWebPlatform) {
    const result = Array.from(webStorage.invoices.values())
      .find(inv => inv.weekly_demurrage_id === weeklyDemurrageId);
    if (!result) return null;
    return JSON.parse(decrypt(result.encrypted_data)) as Invoice;
  } else {
    const database = getDb();
    const result = await database.getFirstAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM invoices WHERE weekly_demurrage_id = ?',
      [weeklyDemurrageId]
    );
    
    if (!result) return null;
    return JSON.parse(decrypt(result.encrypted_data)) as Invoice;
  }
}

/**
 * Update invoice sent timestamp
 */
export async function updateInvoiceSentAt(invoiceId: string, sentAt: number): Promise<void> {
  if (isWebPlatform) {
    const existing = webStorage.invoices.get(invoiceId);
    if (existing) {
      const invoice = JSON.parse(decrypt(existing.encrypted_data)) as Invoice;
      invoice.sentAt = sentAt;
      existing.encrypted_data = encrypt(JSON.stringify(invoice));
      existing.sent_at = sentAt;
      saveWebStorage();
    }
  } else {
    const database = getDb();
    
    // Get the invoice first
    const result = await database.getFirstAsync<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    if (result) {
      const invoice = JSON.parse(decrypt(result.encrypted_data)) as Invoice;
      invoice.sentAt = sentAt;
      const encryptedData = encrypt(JSON.stringify(invoice));
      
      await database.runAsync(
        `UPDATE invoices SET encrypted_data = ?, sent_at = ? WHERE id = ?`,
        [encryptedData, sentAt, invoiceId]
      );
    }
  }
}

/**
 * Recalculate weekly demurrage from events
 */
export async function recalculateWeeklyDemurrage(weekStartDate: string): Promise<WeeklyDemurrage> {
  const events = await getDemurrageEventsByWeek(weekStartDate);
  
  // Debug logging
  console.log(`Recalculating for week ${weekStartDate}:`);
  console.log(`Found ${events.length} demurrage events:`);
  events.forEach((e, i) => {
    console.log(`  Event ${i + 1}: ID=${e.id.substring(0, 8)}..., Duration=${e.durationMinutes} min, IsDemurrage=${e.isDemurrage}`);
  });
  
  const totalMinutes = events.reduce((sum, e) => sum + e.durationMinutes, 0);
  console.log(`Total demurrage: ${totalMinutes} minutes from ${events.length} events`);
  
  await updateWeeklyDemurrage(weekStartDate, totalMinutes, events.length);
  return getOrCreateWeeklyDemurrage(weekStartDate);
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/**
 * Clear all tracking data (stop events and weekly demurrage)
 * Keeps settings intact
 */
export async function clearAllTrackingData(): Promise<void> {
  if (isWebPlatform) {
    webStorage.stopEvents.clear();
    webStorage.weeklyDemurrage.clear();
    webStorage.invoices.clear();
    saveWebStorage();
    console.log('Web tracking data cleared');
  } else {
    try {
      const database = await ensureDb();
      await database.execAsync(`
        DELETE FROM stop_events;
        DELETE FROM weekly_demurrage;
        DELETE FROM invoices;
      `);
      console.log('Native tracking data cleared');
    } catch (error) {
      console.error('Error clearing tracking data:', error);
      throw error;
    }
  }
}
