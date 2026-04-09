'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, type Trip } from '@/lib/db';

const STORES = [
  'SM Supermarket', 'Puregold', 'Robinsons Supermarket', 'Shopwise',
  'Walter Mart', 'Metro Supermarket', 'S&R', 'Landmark', 'Other',
];

export default function HomePage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [budget, setBudget] = useState('');
  const [store, setStore] = useState(STORES[0]);
  const [customStore, setCustomStore] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const all = await db.trips.orderBy('date').reverse().limit(10).toArray();
      setTrips(all);
      setLoading(false);
    };
    load();
  }, []);

  const startTrip = async () => {
    if (!budget || isNaN(Number(budget)) || Number(budget) <= 0) return;
    const id = crypto.randomUUID();
    const storeName = store === 'Other' ? customStore || 'Other' : store;
    const trip: Trip = {
      id,
      date: new Date().toISOString(),
      store: storeName,
      budget: Number(budget),
      total: 0,
      paid: false,
    };
    await db.trips.put(trip);
    router.push(`/basket/${id}`);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const budgetColor = (trip: Trip) => {
    if (!trip.paid) return 'text-slate-500';
    const pct = trip.total / trip.budget;
    if (pct <= 0.85) return 'text-green-600';
    if (pct <= 1) return 'text-amber-500';
    return 'text-red-600';
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-green-600 text-white px-4 py-5 shadow-md flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🛒 Ohm&apos;s Basket</h1>
          <p className="text-green-100 text-sm mt-0.5">Family grocery budget tracker</p>
        </div>
        <button onClick={() => router.push('/settings')} className="text-green-100 hover:text-white text-2xl p-1">⚙️</button>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {/* Start New Trip */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-2xl shadow-md text-lg transition-colors"
          >
            + Start New Trip
          </button>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-5">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">New Grocery Trip</h2>

            <label className="block text-sm font-medium text-slate-600 mb-1">Store</label>
            <select
              value={store}
              onChange={e => setStore(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {STORES.map(s => <option key={s}>{s}</option>)}
            </select>

            {store === 'Other' && (
              <>
                <label className="block text-sm font-medium text-slate-600 mb-1">Store Name</label>
                <input
                  type="text"
                  placeholder="e.g. Family Mart Taguig"
                  value={customStore}
                  onChange={e => setCustomStore(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 mb-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </>
            )}

            <label className="block text-sm font-medium text-slate-600 mb-1">Budget (PHP)</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₱</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startTrip}
                disabled={!budget}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Start Shopping
              </button>
            </div>
          </div>
        )}

        {/* Recent Trips */}
        <div className="mt-6">
          <h2 className="text-base font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent Trips</h2>
          {loading ? (
            <p className="text-slate-400 text-sm">Loading...</p>
          ) : trips.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-sm">No trips yet. Start your first shopping trip!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => (
                <div
                  key={trip.id}
                  onClick={() => router.push(trip.paid ? `/history/${trip.id}` : `/basket/${trip.id}`)}
                  className="bg-white rounded-2xl shadow-sm px-4 py-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div>
                    <p className="font-semibold text-slate-700">{trip.store}</p>
                    <p className="text-sm text-slate-400">{formatDate(trip.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${budgetColor(trip)}`}>
                      ₱{trip.total.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {trip.paid ? `Budget ₱${trip.budget.toFixed(0)}` : '⏳ In progress'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {trips.length > 0 && (
          <button
            onClick={() => router.push('/history')}
            className="w-full mt-5 text-green-600 font-medium py-3 text-sm hover:underline"
          >
            View all trips &amp; price history →
          </button>
        )}
      </main>
    </div>
  );
}
