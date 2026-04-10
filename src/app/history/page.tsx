'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, type Trip, type BasketItem, type PriceRecord } from '@/lib/db';

// ─── Trip Detail View ─────────────────────────────────────────────────────────

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
        const history = await db.priceRecords.where('brand').equals(item.brand).sortBy('date');
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
    const diff = item.price - prev;
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
            <div className={`h-2 rounded-full ${trip.total > trip.budget ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min((trip.total / trip.budget) * 100, 100)}%` }} />
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

// ─── Price Compare: cheapest store per brand ──────────────────────────────────

interface StorePrice { store: string; price: number; date: string; }
interface BrandCompare { brand: string; description: string; stores: StorePrice[]; cheapest: string; }

function PriceCompareTab() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<BrandCompare[]>([]);
  const [allBrands, setAllBrands] = useState<BrandCompare[]>([]);

  useEffect(() => {
    const load = async () => {
      const records = await db.priceRecords.toArray();
      // Group by brand → then by store → keep lowest price per store
      const brandMap = new Map<string, Map<string, StorePrice>>();
      const brandDesc = new Map<string, string>();
      for (const rec of records) {
        if (!rec.store) continue;
        const key = rec.brand.toLowerCase();
        if (!brandMap.has(key)) brandMap.set(key, new Map());
        brandDesc.set(key, rec.description || brandDesc.get(key) || '');
        const storeMap = brandMap.get(key)!;
        const existing = storeMap.get(rec.store);
        if (!existing || rec.price < existing.price) {
          storeMap.set(rec.store, { store: rec.store, price: rec.price, date: rec.date });
        }
      }
      const compared: BrandCompare[] = [];
      for (const [key, storeMap] of brandMap.entries()) {
        const stores = Array.from(storeMap.values()).sort((a, b) => a.price - b.price);
        if (stores.length < 1) continue;
        const brand = records.find(r => r.brand.toLowerCase() === key)?.brand ?? key;
        compared.push({ brand, description: brandDesc.get(key) || '', stores, cheapest: stores[0].store });
      }
      compared.sort((a, b) => a.brand.localeCompare(b.brand));
      setAllBrands(compared);
      setResults(compared);
    };
    load();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults(allBrands); return; }
    const q = search.toLowerCase();
    setResults(allBrands.filter(b =>
      b.brand.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
    ));
  }, [search, allBrands]);

  return (
    <>
      <div className="mb-4">
        <input type="text" placeholder="Search brand or product..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-3xl mb-2">🏪</p>
          <p className="text-sm">
            {allBrands.length === 0
              ? 'No price data yet. Start a trip and scan/add items to build your price history.'
              : `No results for "${search}"`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map(item => (
            <div key={item.brand} className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-700">{item.brand}</p>
                  {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                </div>
                <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                  Best: {item.cheapest}
                </span>
              </div>
              <div className="space-y-1">
                {item.stores.map((s, idx) => (
                  <div key={s.store} className={`flex justify-between items-center text-sm rounded-lg px-2 py-1 ${idx === 0 ? 'bg-green-50' : 'bg-slate-50'}`}>
                    <span className={`${idx === 0 ? 'text-green-700 font-medium' : 'text-slate-500'}`}>
                      {idx === 0 ? '🏆 ' : ''}{s.store}
                    </span>
                    <span className={`font-bold ${idx === 0 ? 'text-green-700' : 'text-slate-600'}`}>
                      ₱{s.price.toFixed(2)}
                      {idx > 0 && (
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          (+₱{(s.price - item.stores[0].price).toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Store Compare: full basket estimate across stores ────────────────────────

interface BasketEstimate { store: string; estimated: number; itemsCovered: number; total: number; }

function StoreCompareTab() {
  const [basketInput, setBasketInput] = useState('');
  const [estimates, setEstimates] = useState<BasketEstimate[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const runCompare = async () => {
    const brands = basketInput.split('\n').map(b => b.trim()).filter(Boolean);
    if (brands.length === 0) return;
    setLoading(true);
    setSearched(true);

    const allRecords = await db.priceRecords.toArray();
    // For each brand in the list, find lowest price per store
    const storeMap = new Map<string, { total: number; covered: number }>();

    for (const inputBrand of brands) {
      const q = inputBrand.toLowerCase();
      const matching = allRecords.filter(r =>
        r.brand.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      );
      // Group by store, keep lowest price per store
      const byStore = new Map<string, number>();
      for (const rec of matching) {
        if (!rec.store) continue;
        const existing = byStore.get(rec.store);
        if (existing === undefined || rec.price < existing) byStore.set(rec.store, rec.price);
      }
      for (const [store, price] of byStore.entries()) {
        const cur = storeMap.get(store) ?? { total: 0, covered: 0 };
        storeMap.set(store, { total: cur.total + price, covered: cur.covered + 1 });
      }
    }

    const result: BasketEstimate[] = Array.from(storeMap.entries()).map(([store, data]) => ({
      store,
      estimated: data.total,
      itemsCovered: data.covered,
      total: brands.length,
    })).sort((a, b) => {
      // Sort by coverage desc, then price asc
      if (b.itemsCovered !== a.itemsCovered) return b.itemsCovered - a.itemsCovered;
      return a.estimated - b.estimated;
    });

    setEstimates(result);
    setLoading(false);
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <p className="text-sm font-medium text-slate-600 mb-2">Enter your shopping list (one item per line):</p>
        <textarea
          value={basketInput}
          onChange={e => setBasketInput(e.target.value)}
          placeholder={'Nestle Fresh Milk\nLucky Me Pancit Canton\nAriel Liquid Detergent'}
          rows={5}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
        />
        <button onClick={runCompare} disabled={!basketInput.trim() || loading}
          className="w-full mt-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
          {loading ? 'Comparing...' : 'Compare Stores'}
        </button>
      </div>

      {searched && estimates.length === 0 && !loading && (
        <div className="text-center py-8 text-slate-400">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm">No price data found for these items yet.<br />Shop more trips first to build price history!</p>
        </div>
      )}

      {estimates.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 text-center">
            Based on lowest recorded prices per store
          </p>
          {estimates.map((est, idx) => (
            <div key={est.store} className={`rounded-2xl shadow-sm px-4 py-3 ${idx === 0 ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {idx === 0 && <span className="text-base">🏆</span>}
                  <p className={`font-semibold ${idx === 0 ? 'text-green-700' : 'text-slate-700'}`}>{est.store}</p>
                </div>
                <p className={`font-bold text-lg ${idx === 0 ? 'text-green-700' : 'text-slate-700'}`}>
                  ₱{est.estimated.toFixed(2)}
                </p>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{est.itemsCovered}/{est.total} items have price data</span>
                {idx === 0 && est.itemsCovered === est.total && (
                  <span className="text-green-600 font-medium">Cheapest option</span>
                )}
              </div>
              {est.itemsCovered < est.total && (
                <p className="text-xs text-amber-500 mt-1">
                  {est.total - est.itemsCovered} item(s) not yet recorded at this store
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Price Tracker (original search) ─────────────────────────────────────────

function PriceTrackerTab() {
  const [priceSearch, setPriceSearch] = useState('');
  const [priceHistory, setPriceHistory] = useState<PriceRecord[]>([]);

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

  return (
    <>
      <div className="mb-4">
        <input type="text" placeholder="Search brand or product..." value={priceSearch}
          onChange={e => setPriceSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      {!priceSearch.trim() ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-sm">Search for a brand or product to see full price history</p>
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
  );
}

// ─── Trip List + tabs ─────────────────────────────────────────────────────────

function HistoryList() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tab, setTab] = useState<'trips' | 'compare' | 'storecompare' | 'prices'>('trips');

  useEffect(() => {
    db.trips.orderBy('date').reverse().toArray().then(setTrips);
  }, []);

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
        <h1 className="font-bold text-lg">History & Prices</h1>
      </header>

      {/* Tabs — scrollable row */}
      <div className="bg-white border-b border-slate-100 flex overflow-x-auto">
        {([
          { key: 'trips', label: 'Trips' },
          { key: 'compare', label: '🏪 Cheapest Store' },
          { key: 'storecompare', label: '📊 Store Compare' },
          { key: 'prices', label: '🔍 Price Log' },
        ] as { key: typeof tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? 'border-green-600 text-green-700' : 'border-transparent text-slate-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full overflow-y-auto">
        {tab === 'trips' && (
          trips.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No completed trips yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => (
                <div key={trip.id}
                  onClick={() => router.push(trip.paid ? `/history?id=${trip.id}` : `/basket?id=${trip.id}`)}
                  className="bg-white rounded-2xl shadow-sm px-4 py-4 cursor-pointer hover:shadow-md transition-shadow">
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
                    <div className={`h-1.5 rounded-full ${trip.total > trip.budget ? 'bg-red-500' : trip.total / trip.budget > 0.85 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min((trip.total / trip.budget) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'compare' && <PriceCompareTab />}
        {tab === 'storecompare' && <StoreCompareTab />}
        {tab === 'prices' && <PriceTrackerTab />}
      </main>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

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
