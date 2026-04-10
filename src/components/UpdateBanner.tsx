'use client';

import { useEffect, useState } from 'react';
import { checkForUpdate, type UpdateInfo } from '@/lib/updater';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.1';
// How long to wait before checking (ms) — check after 3s so the app loads first
const CHECK_DELAY_MS = 3000;
// LocalStorage key to suppress banner until next update
const DISMISSED_KEY = 'ohms-basket-dismissed-update';

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Don't check if already dismissed for this version
    const dismissedVersion = localStorage.getItem(DISMISSED_KEY);
    if (dismissedVersion === APP_VERSION) {
      // might be a newer one, still check but suppress same-version banner
    }

    const timer = setTimeout(async () => {
      const info = await checkForUpdate(APP_VERSION);
      if (!info) return;

      // Check if user already dismissed this specific version
      const dismissedVer = localStorage.getItem(DISMISSED_KEY);
      if (dismissedVer === info.version) return;

      setUpdate(info);
    }, CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    if (update) localStorage.setItem(DISMISSED_KEY, update.version);
    setDismissed(true);
  }

  function openDownload() {
    // Open the APK download URL — on Android this triggers the browser download
    window.open(update!.apkUrl, '_blank', 'noopener');
  }

  if (!update || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-green-700 text-white shadow-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <span className="text-xl flex-shrink-0">⬆️</span>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Update available — v{update.version}
          </p>
          <p className="text-xs text-green-200 leading-tight">
            Tap Download, install over existing app
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {update.notes && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-green-200 underline"
            >
              {expanded ? 'Less' : "What's new"}
            </button>
          )}
          <button
            onClick={openDownload}
            className="bg-white text-green-800 text-xs font-bold px-3 py-1.5 rounded-lg"
          >
            Download
          </button>
          <button
            onClick={dismiss}
            className="text-green-200 text-lg leading-none px-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>

      {/* Expandable release notes */}
      {expanded && update.notes && (
        <div className="px-4 pb-3">
          <div className="bg-green-800 rounded-lg p-3 text-xs text-green-100 leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto">
            {update.notes.trim()}
          </div>
        </div>
      )}
    </div>
  );
}
