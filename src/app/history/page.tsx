'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, type Trip, type PriceRecord } from '@/lib/db';

export default function HistoryPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceHistory, setPriceHistory] = useState<PriceRecord[]>([]);
  const [tab, setTab] = useState<'trips' | 'prices'>('trips');

  useEffect(() => {
    const load = async () => {
      const all = await db.trips.orderBy('date').reverse().toArray();
      setTrips(all);
    };
    load();
  }, []);

  useEffect(() => {
    const search = async () => {
      if (!priceSearch.trim()) { setPriceHistory([]); return; }
      const results = await db.priceRecords
        .filter(r => r.brand.toLowerCase().includes(priceSearch.toLowerCase()) ||
          r.description.toLowerCase().includes(priceSearch.toLowerCase()))
        .sortBy('date');
      setPriceHistory(results.reverse());
    };
    search();
  }, [priceSearch]);

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  const tripBadge = (trip: Trip) => {
    const pct = trip.total / trip.budget;
    if (pct <= 0.85) return 'bg-green-100 text-green-700';
    if (pct <= 1) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
        <h1 className="font-bold text-lg">History</h1>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 flex">
        <button
          onClick={() => setTab('trips')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'trips' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-400'}`}
        >
          Trip History
        </button>
        <button
          onClick={() => setTab('prices')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'prices' ? 'border-green-600 text-green-700' : 'border-transparent text-slate-400'}`}
        >
          Price Tracker
        </button>
      </div>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {tab === 'trips' && (
          <>
            {trips.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">No completed trips yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trips.map(trip => (
                  <div
                    key={trip.id}
                    onClick={() => router.push(`/history/${trip.id}`)}
                    className="bg-white rounded-2xl shadow-sm px-4 py-4 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-slate-700">{trip.store}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trip.paid ? tripBadge(trip) : 'bg-slate-100 text-slate-500'}`}>
                        {trip.paid ? (trip.total <= trip.budget ? 'Within budget' : 'Over budget') : 'In progress'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{formatDate(trip.date)}</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Budget: ₱{trip.budget.toFixed(2)}</span>
                      <span className={`font-bold ${trip.total > trip.budget ? 'text-red-600' : 'text-green-600'}`}>
                        Spent: ₱{trip.total.toFixed(2)}
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${trip.total > trip.budget ? 'bg-red-500' : trip.total / trip.budget > 0.85 ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min((trip.total / trip.budget) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'prices' && (
          <>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search brand or product..."
                value={priceSearch}
                onChange={e => setPriceSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {!priceSearch.trim() ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm">Search for a brand or product to see price history</p>
              </div>
            ) : priceHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm">No price records found for &quot;{priceSearch}&quot;</p>
              </div>
            ) : (
              <div className="space-y-2">
                {priceHistory.map(rec => (
                  <div key={rec.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-700">{rec.brand}</p>
                        {rec.description && <p className="text-xs text-slate-400">{rec.description}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">{rec.store} · {formatDate(rec.date)}</p>
                      </div>
                      <p className="font-bold text-green-700 text-lg">₱{rec.price.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
