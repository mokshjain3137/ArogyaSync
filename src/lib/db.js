import Dexie from 'dexie';

export const db = new Dexie('ArogyaSyncLocalDB');

/**
 * ArogyaSync Local Database (IndexedDB via Dexie)
 *
 * Schema:
 *   patients    — permanent patient identity (name, blood group, allergies, critical history, QR hash)
 *   visits      — per-visit records: triage, vitals, status, assigned doctor, specialist type
 *   documents   — references to lab records / X-rays stored in Supabase Storage
 *   doctors     — PHC doctor roster with specialty and duty status (managed by ASHA)
 *   inventory   — PHC medical stock
 *   sync_queue  — offline action log for Supabase replay
 */
db.version(3).stores({
  patients:   'id, name, phone, blood_group, qr_hash, created_at',
  visits:     'id, patient_id, doctor_id, triage_status, status, specialist_required, created_at',
  documents:  'id, patient_id, visit_id, document_type, uploaded_at',
  doctors:    'id, full_name, specialty, is_on_duty, phc_id',
  inventory:  'id, item_name, quantity, min_threshold, last_updated',
  sync_queue: '++id, table_name, action, timestamp, status'
});

export const CURRENT_SEED_VERSION = 'v4_clean_zero_data_production_2026';

// Helper: UUID generator (works offline)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Purges ALL local records, queues, logs, and storage keys.
 * Leaves the database 100% clean with zero patient/doctor/visit/ASHA records.
 */
export const resetAllDatabaseData = async () => {
  console.log('[ArogyaSync] Purging all database tables and local storage...');
  window.__AROGYASYNC_SEEDED = true;
  
  try {
    await db.patients.clear();
    await db.doctors.clear();
    await db.visits.clear();
    await db.inventory.clear();
    await db.documents.clear();
    await db.sync_queue.clear();
  } catch (err) {
    console.warn('[ArogyaSync] Error clearing tables:', err);
  }

  try {
    localStorage.removeItem('lora_gateway_packets');
    localStorage.removeItem('lora_logs');
    localStorage.removeItem('asha_lora_logs');
    localStorage.removeItem('ble_emulated_connected');
    localStorage.setItem('arogya_db_version', CURRENT_SEED_VERSION);
    sessionStorage.removeItem('offline_role');
  } catch (err) {
    console.warn('[ArogyaSync] Error clearing logs:', err);
  }

  // Also reset Python backend LoRa queue if running
  try {
    fetch('http://localhost:5000/api/lora/reset', { method: 'POST' }).catch(() => {});
  } catch {}

  console.log('[ArogyaSync] All data purged. Database is completely clean.');
};

/**
 * Checks database version. If version updated, wipes any old test data and keeps tables clean.
 * Does NOT seed mock data.
 */
export const seedInitialData = async (force = false) => {
  const storedVersion = typeof localStorage !== 'undefined' ? localStorage.getItem('arogya_db_version') : null;
  const needsVersionUpgrade = storedVersion !== CURRENT_SEED_VERSION;

  if (!force && !needsVersionUpgrade && window.__AROGYASYNC_SEEDED) return;
  window.__AROGYASYNC_SEEDED = true;

  if (needsVersionUpgrade || force) {
    console.log('[ArogyaSync] Purging all legacy mock data to clean zero-data state...');
    try {
      await db.patients.clear();
      await db.doctors.clear();
      await db.visits.clear();
      await db.inventory.clear();
      await db.documents.clear();
      await db.sync_queue.clear();
      localStorage.removeItem('lora_gateway_packets');
      localStorage.removeItem('lora_logs');
      localStorage.removeItem('asha_lora_logs');
      localStorage.setItem('arogya_db_version', CURRENT_SEED_VERSION);
    } catch (e) {
      console.warn('[ArogyaSync] Version upgrade clear warning:', e);
    }
  }
};

// Automatically run check on module load
seedInitialData();
