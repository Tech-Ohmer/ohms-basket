/**
 * Sync strategy: JSON export/import (fully free, no backend required).
 *
 * How family sync works:
 * - Export: downloads all data as ohms-basket-backup.json
 * - Import: load a backup JSON file from another family member's export
 * - Each phone is offline-first; share the file via WhatsApp, Google Drive, etc.
 */
import { db, type Trip, type BasketItem, type PriceRecord } from './db';

export interface BackupData {
  exportedAt: string;
  trips: Trip[];
  basketItems: BasketItem[];
  priceRecords: PriceRecord[];
}

/** Export all data as a downloadable JSON file */
export async function exportData(): Promise<void> {
  const trips = await db.trips.toArray();
  const basketItems = await db.basketItems.toArray();
  const priceRecords = await db.priceRecords.toArray();

  const backup: BackupData = {
    exportedAt: new Date().toISOString(),
    trips,
    basketItems,
    priceRecords,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ohms-basket-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a backup JSON file — merges without overwriting existing records */
export async function importData(file: File): Promise<{ added: number; skipped: number }> {
  const text = await file.text();
  const backup: BackupData = JSON.parse(text);

  let added = 0;
  let skipped = 0;

  for (const trip of backup.trips ?? []) {
    const existing = await db.trips.get(trip.id);
    if (!existing) { await db.trips.put(trip); added++; }
    else skipped++;
  }
  for (const item of backup.basketItems ?? []) {
    const existing = await db.basketItems.get(item.id);
    if (!existing) { await db.basketItems.put(item); added++; }
    else skipped++;
  }
  for (const rec of backup.priceRecords ?? []) {
    const existing = await db.priceRecords.get(rec.id);
    if (!existing) { await db.priceRecords.put(rec); added++; }
    else skipped++;
  }

  return { added, skipped };
}

// Legacy stubs — kept so basket/[id]/page.tsx compiles without changes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncTripToCloud(..._args: any[]) { /* no-op */ }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPriceRecordsToCloud(..._args: any[]) { /* no-op */ }
export async function pullCloudData() { /* no-op */ }
