'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { exportData, importData } from '@/lib/sync';
import { db } from '@/lib/db';

export default function SettingsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [cleared, setCleared] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportData();
    } catch {
      setError('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const result = await importData(file);
      setImportResult(result);
    } catch {
      setError('Import failed — make sure the file is a valid Ohm\'s Basket backup.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAllData = async () => {
    if (!confirm('Delete ALL local data? This cannot be undone.')) return;
    await db.trips.clear();
    await db.basketItems.clear();
    await db.priceRecords.clear();
    setCleared(true);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
        <h1 className="font-bold text-lg">Settings</h1>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-5">

        {/* Sync section */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-700 mb-1">Family Sync</h2>
          <p className="text-sm text-slate-400 mb-4">
            Share your data with family by exporting a backup file and sending it via WhatsApp or Google Drive.
            The other phone imports that file to merge data.
          </p>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl mb-3 transition-colors"
          >
            {exporting ? 'Exporting...' : '⬇ Export Backup (JSON)'}
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="w-full border-2 border-green-600 text-green-700 font-semibold py-3 rounded-xl transition-colors hover:bg-green-50"
          >
            {importing ? 'Importing...' : '⬆ Import Backup (JSON)'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="hidden"
          />

          {importResult && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              ✓ Import done — {importResult.added} new records added, {importResult.skipped} already existed.
            </div>
          )}
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-700 mb-1">About</h2>
          <p className="text-sm text-slate-400">
            Ohm&apos;s Basket v1.0 — Fully offline, fully free.<br />
            All data stored on your phone. No accounts. No cloud. No cost.
          </p>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-red-100">
          <h2 className="font-semibold text-red-600 mb-1">Danger Zone</h2>
          <p className="text-sm text-slate-400 mb-3">Permanently delete all local data from this device.</p>
          {cleared ? (
            <p className="text-sm text-green-600 font-medium">✓ All data cleared.</p>
          ) : (
            <button
              onClick={clearAllData}
              className="w-full border border-red-300 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 transition-colors"
            >
              Clear All Data
            </button>
          )}
        </div>

      </main>
    </div>
  );
}
