'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db, type Trip, type BasketItem, type PriceRecord } from '@/lib/db';

interface ItemWithHistory extends BasketItem {
  history: PriceRecord[];
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<ItemWithHistory[]>([]);

  useEffect(() => {
    const load = async () => {
      const t = await db.trips.get(id);
      if (!t) return;
      setTrip(t);
      const its = await db.basketItems.where('tripId').equals(id).toArray();
      // Enrich with price history per brand
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
          {/* Progress bar */}
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

        {/* Item list */}
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

                {/* Price history mini chart */}
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
