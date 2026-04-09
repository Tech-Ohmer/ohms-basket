'use client';

import { useRef, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, type BasketItem, type PriceRecord } from '@/lib/db';

interface OCRResult {
  brand: string;
  description: string;
  price: string;
}

function parseOCRText(text: string): OCRResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Find price — look for pattern like 99.00, 199.50, ₱100
  const pricePattern = /(?:₱|PHP\s*)?([\d,]+\.?\d{0,2})/;
  let price = '';
  let priceLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(pricePattern);
    if (m) {
      const val = parseFloat(m[1].replace(',', ''));
      if (val > 0 && val < 100000) {
        price = val.toFixed(2);
        priceLineIdx = i;
        break;
      }
    }
  }

  // Brand is usually the first non-price line (all caps or prominent)
  const nonPriceLines = lines.filter((_, i) => i !== priceLineIdx);
  const brand = nonPriceLines[0] || '';
  const description = nonPriceLines.slice(1).join(' ').substring(0, 60);

  return { brand, description, price };
}

function ScanContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<'camera' | 'preview' | 'result'>('camera');
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [result, setResult] = useState<OCRResult>({ brand: '', description: '', price: '' });
  const [qty, setQty] = useState('1');
  const [cameraError, setCameraError] = useState('');
  const [cameraErrorType, setCameraErrorType] = useState<'permission' | 'unavailable' | ''>('');
  const [cameraStarted, setCameraStarted] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setCameraErrorType('');

    // Check if getUserMedia is even available (won't be on non-https without Capacitor)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API not available on this device.');
      setCameraErrorType('unavailable');
      return;
    }

    try {
      // Try back camera first, fall back to any camera
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch {
        // Fall back to any available camera
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraError('');
      setCameraErrorType('');
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraErrorType('permission');
        setCameraError(
          'Camera permission denied. Please allow camera access:\n\n' +
          'Android: Settings → Apps → Ohms Basket → Permissions → Camera → Allow'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraErrorType('unavailable');
        setCameraError('No camera found on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setCameraErrorType('unavailable');
        setCameraError('Camera is in use by another app. Close other apps and try again.');
      } else {
        setCameraErrorType('unavailable');
        setCameraError(`Camera error: ${error.message || 'Unknown error'}. Try restarting the app.`);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
    setPhase('preview');
  }, [stopCamera]);

  const runOCR = useCallback(async () => {
    if (!capturedImage) return;
    setOcrLoading(true);
    setPhase('result');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(capturedImage);
      await worker.terminate();
      const parsed = parseOCRText(data.text);
      setResult(parsed);
    } catch {
      setResult({ brand: '', description: '', price: '' });
    } finally {
      setOcrLoading(false);
    }
  }, [capturedImage]);

  const addToBasket = async () => {
    if (!result.brand || !result.price) return;
    const trip = await db.trips.get(id);
    const item: BasketItem = {
      id: crypto.randomUUID(),
      tripId: id,
      brand: result.brand.trim(),
      description: result.description.trim(),
      price: Number(result.price),
      quantity: Number(qty) || 1,
    };
    await db.basketItems.put(item);
    // Save price record
    const rec: PriceRecord = {
      id: crypto.randomUUID(),
      brand: item.brand,
      description: item.description,
      price: item.price,
      store: trip?.store || '',
      date: new Date().toISOString(),
    };
    await db.priceRecords.put(rec);
    // Update trip total
    if (trip) {
      const allItems = await db.basketItems.where('tripId').equals(id).toArray();
      const newTotal = allItems.reduce((s, i) => s + i.price * i.quantity, 0) + item.price * item.quantity;
      await db.trips.put({ ...trip, total: newTotal });
    }
    router.push(`/basket?id=${id}`);
  };

  // Auto-start camera on mount (once)
  if (phase === 'camera' && !streamRef.current && !cameraError && !cameraStarted) {
    setCameraStarted(true);
    startCamera();
  }

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Header */}
      <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => { stopCamera(); router.push(`/basket?id=${id}`); }}
          className="text-green-100 hover:text-white text-xl"
        >←</button>
        <h1 className="font-semibold">Scan Price Tag</h1>
      </header>

      {/* Camera phase */}
      {phase === 'camera' && (
        <div className="flex flex-col flex-1 items-center justify-between py-6 px-4">
          {cameraError ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <p className="text-4xl mb-4">{cameraErrorType === 'permission' ? '🔒' : '📷'}</p>
              <p className="text-white text-sm mb-2 font-semibold">
                {cameraErrorType === 'permission' ? 'Camera Permission Required' : 'Camera Unavailable'}
              </p>
              <p className="text-slate-300 text-xs mb-6 leading-relaxed whitespace-pre-line">{cameraError}</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => { setCameraError(''); setCameraErrorType(''); startCamera(); }}
                  className="bg-green-600 text-white font-semibold px-6 py-3 rounded-xl"
                >
                  Try Again
                </button>
                <button
                  onClick={() => router.push(`/basket?id=${id}`)}
                  className="border border-slate-500 text-slate-300 font-medium px-6 py-3 rounded-xl"
                >
                  Back to Basket
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-full max-w-sm rounded-2xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full"
                />
                {/* Viewfinder guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-green-400 rounded-xl w-3/4 h-1/2 opacity-70" />
                </div>
              </div>
              <p className="text-slate-400 text-sm text-center mb-4">Point at the price tag on the shelf</p>
              <button
                onClick={capture}
                className="w-20 h-20 rounded-full bg-white border-4 border-green-500 shadow-lg flex items-center justify-center text-2xl hover:scale-105 transition-transform"
              >
                📷
              </button>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Preview phase */}
      {phase === 'preview' && (
        <div className="flex flex-col flex-1 bg-slate-900 items-center justify-between py-6 px-4">
          <div className="w-full max-w-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capturedImage} alt="Captured" className="w-full rounded-2xl shadow-lg" />
          </div>
          <p className="text-slate-400 text-sm text-center my-4">Looks good? Extract text from this image.</p>
          <div className="flex gap-3 w-full max-w-sm">
            <button
              onClick={() => { setCapturedImage(''); setPhase('camera'); startCamera(); }}
              className="flex-1 border border-slate-600 text-slate-300 font-medium py-3 rounded-xl"
            >
              Retake
            </button>
            <button
              onClick={runOCR}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl"
            >
              Extract Text →
            </button>
          </div>
        </div>
      )}

      {/* Result phase */}
      {phase === 'result' && (
        <div className="flex-1 bg-white px-4 py-5 max-w-lg mx-auto w-full">
          {ocrLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-500 text-sm">Reading price tag...</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mb-4">Confirm Item</h2>

              <label className="block text-sm font-medium text-slate-600 mb-1">Brand</label>
              <input
                type="text"
                value={result.brand}
                onChange={e => setResult(r => ({ ...r, brand: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. Nestle"
              />

              <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
              <input
                type="text"
                value={result.description}
                onChange={e => setResult(r => ({ ...r, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. Fresh Milk 1L"
              />

              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={result.price}
                    onChange={e => setResult(r => ({ ...r, price: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Price"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={qty}
                    min="1"
                    onChange={e => setQty(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Qty"
                  />
                </div>
              </div>

              {/* Image thumbnail */}
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedImage} alt="Scanned" className="w-full max-h-32 object-cover rounded-xl opacity-60" />
                <p className="text-xs text-slate-400 mt-1 text-center">Image used for OCR — not stored</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setPhase('camera'); startCamera(); }}
                  className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl hover:bg-slate-50"
                >
                  Scan Again
                </button>
                <button
                  onClick={addToBasket}
                  disabled={!result.brand || !result.price}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl"
                >
                  Add to Basket
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <ScanContent />
    </Suspense>
  );
}
