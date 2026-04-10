'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, type Trip, type MonthlyBudget } from '@/lib/db';

interface MonthData {
  key: string;        // "YYYY-MM"
  label: string;      // "April 2026"
  budget: number;
  spent: number;
  trips: Trip[];
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export default function BudgetPage() {
  const router = useRouter();
  const [months, setMonths] = useState<MonthData[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [loading, setLoading] = useState(true);

  const currentKey = getMonthKey(new Date());

  const load = async () => {
    const allTrips = await db.trips.where('paid').equals(1).toArray();
    const budgets = await db.monthlyBudgets.toArray();
    const budgetMap = new Map(budgets.map(b => [b.id, b.budget]));

    // Group paid trips by month
    const tripsByMonth = new Map<string, Trip[]>();
    for (const trip of allTrips) {
      const key = getMonthKey(new Date(trip.date));
      if (!tripsByMonth.has(key)) tripsByMonth.set(key, []);
      tripsByMonth.get(key)!.push(trip);
    }

    // Ensure current month is always shown
    if (!tripsByMonth.has(currentKey)) tripsByMonth.set(currentKey, []);

    const monthData: MonthData[] = Array.from(tripsByMonth.entries())
      .map(([key, trips]) => ({
        key,
        label: getMonthLabel(key),
        budget: budgetMap.get(key) ?? 0,
        spent: trips.reduce((sum, t) => sum + t.total, 0),
        trips,
      }))
      .sort((a, b) => b.key.localeCompare(a.key));

    setMonths(monthData);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveBudget = async (key: string) => {
    const val = Number(editBudget);
    if (isNaN(val) || val < 0) return;
    await db.monthlyBudgets.put({ id: key, budget: val });
    setEditingKey(null);
    load();
  };

  const barColor = (spent: number, budget: number) => {
    if (budget === 0) return 'bg-slate-300';
    const pct = spent / budget;
    if (pct <= 0.85) return 'bg-green-500';
    if (pct <= 1) return 'bg-amber-400';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
        <div>
          <h1 className="font-bold text-lg">Monthly Budget</h1>
          <p className="text-green-100 text-xs">Track spending by month</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : (
          <div className="space-y-4">
            {months.map(month => {
              const remaining = month.budget - month.spent;
              const pct = month.budget > 0 ? Math.min((month.spent / month.budget) * 100, 100) : 0;
              const isCurrentMonth = month.key === currentKey;

              return (
                <div key={month.key} className={`bg-white rounded-2xl shadow-sm p-4 ${isCurrentMonth ? 'ring-2 ring-green-500' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-700">
                        {month.label}
                        {isCurrentMonth && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">This month</span>}
                      </p>
                      <p className="text-xs text-slate-400">{month.trips.length} trip{month.trips.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={() => { setEditingKey(month.key); setEditBudget(String(month.budget || '')); }}
                      className="text-xs text-green-600 font-medium border border-green-200 px-3 py-1 rounded-lg">
                      {month.budget ? 'Edit budget' : 'Set budget'}
                    </button>
                  </div>

                  {editingKey === month.key ? (
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                        <input type="number" inputMode="decimal" placeholder="Monthly budget" value={editBudget}
                          onChange={e => setEditBudget(e.target.value)} autoFocus
                          className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <button onClick={() => setEditingKey(null)} className="text-slate-500 border border-slate-200 px-3 py-2 rounded-xl text-sm">Cancel</button>
                      <button onClick={() => saveBudget(month.key)} className="bg-green-600 text-white px-3 py-2 rounded-xl text-sm font-semibold">Save</button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div>
                      <p className="text-xs text-slate-400">Budget</p>
                      <p className="font-bold text-slate-700">
                        {month.budget > 0 ? `₱${month.budget.toFixed(0)}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Spent</p>
                      <p className={`font-bold ${month.budget > 0 && month.spent > month.budget ? 'text-red-600' : 'text-green-600'}`}>
                        ₱{month.spent.toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">{remaining >= 0 ? 'Remaining' : 'Over'}</p>
                      <p className={`font-bold ${remaining >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                        {month.budget > 0 ? `₱${Math.abs(remaining).toFixed(0)}` : '—'}
                      </p>
                    </div>
                  </div>

                  {month.budget > 0 && (
                    <>
                      <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
                        <div className={`h-2 rounded-full transition-all ${barColor(month.spent, month.budget)}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 text-right">{pct.toFixed(0)}% used</p>
                    </>
                  )}

                  {month.trips.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-50">
                      <p className="text-xs text-slate-400 mb-1">Trips this month:</p>
                      <div className="flex flex-wrap gap-1">
                        {month.trips.map(t => (
                          <span key={t.id} className="text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg text-slate-500">
                            {t.store} ₱{t.total.toFixed(0)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
