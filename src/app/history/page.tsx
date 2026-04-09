'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, type Trip, type BasketItem, type PriceRecord } from '@/lib/db';

// ─── Trip Detail View ────────────────────────────────────────────────────────

interface ItemWithHistory extends BasketItem {
  history: PriceRecord[];
}

function TripDetail({ id }: { id: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<ItemWithHistory[]>([]);

  useEffect(() => {
    const load = async () => {
      const t = await db.trips.get(id);
      if (!t) return;
      setTrip(t);
      const its = await db.basketItems.where('tripId').equals(id).toArray();
      const enriched = await Promise.all(its.map(async item => {
        const history = await db.priceRecords
          .where('brand').equals(item.brand)
          .sortBy('date');
        return { ...item, history };
      }));
      setItems(enriched);
    };
    load();
  }, [id]);

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const formatShort = (iso: string) => new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric'
  });

  const priceTrend = (item: ItemWithHistory) => {
    if (item.history.length < 2) return null;
    const prev = item.history[item.history.length - 2].price;
    const curr = item.price;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.01) return null;
    return { diff, up: diff > 0 };
  };

  if (!trip) return <div className="p-6 text-slate-400">Loading...</div>;

  const savings = trip.budget - trip.total;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/history')} className="text-green-100 hover:text-white text-xl">←</button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{trip.store}</h1>
          <p className="text-green-100 text-xs">{formatDate(trip.date)}</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {/* Summary card */}
        <div className="bg-white rounded-2xl shadow-md px-5 py-4 mb-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Budget</p>
              <p className="font-bold text-slate-700">₱{trip.budget.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Spent</p>
              <p className={`font-bold ${trip.total > trip.budget ? 'text-red-600' : 'text-green-600'}`}>
                ₱{trip.total.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">{savings >= 0 ? 'Saved' : 'Over by'}</p>
              <p className={`font-bold ${savings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₱{Math.abs(savings).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-3">
            <div
              className={`h-2 rounded-full ${trip.total > trip.budget ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min((trip.total / trip.budget) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1 text-center">
            {((trip.total / trip.budget) * 100).toFixed(0)}% of budget used
          </p>
        </div>

        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Items ({items.length})
        </h2>

        <div className="space-y-2">
          {items.map(item => {
            const trend = priceTrend(item);
            return (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-semibold text-slate-700">{item.brand}</p>
                    {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                    <p className="text-xs text-slate-400 mt-0.5">
                      ₱{item.price.toFixed(2)} × {item.quantity}
                      {trend && (
                        <span className={`ml-2 font-medium ${trend.up ? 'text-red-500' : 'text-green-600'}`}>
                          {trend.up ? '↑' : '↓'} ₱{Math.abs(trend.diff).toFixed(2)} vs last trip
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="font-bold text-green-700">₱{(item.price * item.quantity).toFixed(2)}</p>
                </div>

                {item.history.length > 1 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {item.history.slice(-5).map((rec, idx) => (
                      <span key={idx} className="text-xs bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 text-slate-500">
                        {formatShort(rec.date)}: ₱{rec.price.toFixed(2)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ─── Trip List + Price Tracker ────────────────────────────────────────────────

function HistoryList() {
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
                    onClick={() => router.push(trip.paid ? `/history?id=${trip.id}` : `/basket?id=${trip.id}`)}
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

// ─── Root — dispatch on ?id param ────────────────────────────────────────────

function HistoryRoot() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  if (id) return <TripDetail id={id} />;
  return <HistoryList />;
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <HistoryRoot />
    </Suspense>
  );
}
