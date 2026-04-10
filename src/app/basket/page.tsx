'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, type Trip, type BasketItem } from '@/lib/db';

function BasketContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<BasketItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [paying, setPaying] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('1');

  const loadData = useCallback(async () => {
    if (!id) return;
    const t = await db.trips.get(id);
    if (!t) return;
    setTrip(t);
    const its = await db.basketItems.where('tripId').equals(id).toArray();
    setItems(its);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const budgetStatus = () => {
    if (!trip) return { color: 'bg-green-500', label: '' };
    const pct = total / trip.budget;
    if (pct <= 0.85) return { color: 'bg-green-500', label: 'Within budget' };
    if (pct <= 1) return { color: 'bg-amber-400', label: 'Getting close' };
    return { color: 'bg-red-500', label: 'Over budget!' };
  };

  const addItem = async () => {
    if (!brand || !price || isNaN(Number(price))) return;
    const item: BasketItem = {
      id: crypto.randomUUID(),
      tripId: id,
      brand: brand.trim(),
      description: description.trim(),
      price: Number(price),
      quantity: Number(qty) || 1,
    };
    await db.basketItems.put(item);
    await db.priceRecords.put({
      id: crypto.randomUUID(),
      brand: item.brand,
      description: item.description,
      price: item.price,
      store: trip?.store || '',
      date: new Date().toISOString(),
    });
    const newTotal = total + item.price * item.quantity;
    if (trip) {
      const updated = { ...trip, total: newTotal };
      await db.trips.put(updated);
      setTrip(updated);
    }
    setBrand(''); setDescription(''); setPrice(''); setQty('1');
    setShowAdd(false);
    loadData();
  };

  const removeItem = async (item: BasketItem) => {
    await db.basketItems.delete(item.id);
    const newTotal = total - item.price * item.quantity;
    if (trip) {
      const updated = { ...trip, total: Math.max(0, newTotal) };
      await db.trips.put(updated);
      setTrip(updated);
    }
    loadData();
  };

  const startEdit = (item: BasketItem) => {
    setEditingId(item.id);
    setEditBrand(item.brand);
    setEditDescription(item.description);
    setEditPrice(String(item.price));
    setEditQty(String(item.quantity));
    setShowAdd(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (item: BasketItem) => {
    if (!editBrand || !editPrice || isNaN(Number(editPrice))) return;
    const oldSubtotal = item.price * item.quantity;
    const updated: BasketItem = {
      ...item,
      brand: editBrand.trim(),
      description: editDescription.trim(),
      price: Number(editPrice),
      quantity: Number(editQty) || 1,
    };
    await db.basketItems.put(updated);
    // Update price record
    await db.priceRecords.put({
      id: crypto.randomUUID(),
      brand: updated.brand,
      description: updated.description,
      price: updated.price,
      store: trip?.store || '',
      date: new Date().toISOString(),
    });
    const newSubtotal = updated.price * updated.quantity;
    const newTotal = total - oldSubtotal + newSubtotal;
    if (trip) {
      const updatedTrip = { ...trip, total: Math.max(0, newTotal) };
      await db.trips.put(updatedTrip);
      setTrip(updatedTrip);
    }
    setEditingId(null);
    loadData();
  };

  const markPaid = async () => {
    if (!trip) return;
    setPaying(true);
    const updated = { ...trip, total, paid: true };
    await db.trips.put(updated);
    router.push(`/history?id=${trip.id}`);
  };

  const status = budgetStatus();
  const remaining = trip ? trip.budget - total : 0;

  if (!trip) return <div className="p-6 text-slate-400">Loading...</div>;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-green-600 text-white px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
          <div>
            <h1 className="font-bold text-lg leading-tight">{trip.store}</h1>
            <p className="text-green-100 text-xs">{new Date(trip.date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
      </header>

      {/* Budget summary bar */}
      <div className="bg-white shadow-sm px-4 py-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-sm text-slate-500">Budget: ₱{trip.budget.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-2xl font-bold text-slate-800">₱{total.toFixed(2)}</span>
          <span className={`text-sm font-medium ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {remaining >= 0 ? `₱${remaining.toFixed(2)} left` : `₱${Math.abs(remaining).toFixed(2)} over`}
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${status.color}`}
            style={{ width: `${Math.min((total / trip.budget) * 100, 100)}%` }}
          />
        </div>
        {status.label && <p className="text-xs mt-1 text-slate-500">{status.label}</p>}
      </div>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Add item form */}
        {showAdd && (
          <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
            <h3 className="font-semibold text-slate-700 mb-3">Add Item</h3>
            <input type="text" placeholder="Brand (e.g. Nestle, Lucky Me)" value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="text" placeholder="Description (e.g. Fresh Milk 1L)" value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                <input type="number" inputMode="decimal" placeholder="Price" value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="w-20">
                <input type="number" inputMode="numeric" placeholder="Qty" value={qty} min="1"
                  onChange={e => setQty(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={addItem} disabled={!brand || !price} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold">Add</button>
            </div>
          </div>
        )}

        {/* Item list */}
        {items.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="text-3xl mb-2">🧺</p>
            <p className="text-sm">Basket is empty. Add your first item!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {editingId === item.id ? (
                  /* ── Edit mode ── */
                  <div className="p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Edit Item</p>
                    <input type="text" placeholder="Brand" value={editBrand}
                      onChange={e => setEditBrand(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <input type="text" placeholder="Description" value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
                        <input type="number" inputMode="decimal" placeholder="Price" value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div className="w-20">
                        <input type="number" inputMode="numeric" placeholder="Qty" value={editQty} min="1"
                          onChange={e => setEditQty(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={cancelEdit} className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm">Cancel</button>
                      <button onClick={() => saveEdit(item)} disabled={!editBrand || !editPrice}
                        className="flex-1 bg-green-600 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold">Save</button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 truncate">{item.brand}</p>
                      {item.description && <p className="text-xs text-slate-400 truncate">{item.description}</p>}
                      <p className="text-xs text-slate-400">₱{item.price.toFixed(2)} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <p className="font-bold text-green-700">₱{(item.price * item.quantity).toFixed(2)}</p>
                      <button onClick={() => startEdit(item)}
                        className="text-slate-300 hover:text-blue-500 transition-colors text-base px-1" title="Edit">✏️</button>
                      <button onClick={() => removeItem(item)}
                        className="text-slate-300 hover:text-red-500 transition-colors text-lg" title="Remove">✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 safe-bottom max-w-lg mx-auto w-full">
        <div className="flex gap-3">
          <button onClick={() => router.push(`/scan?id=${id}`)}
            className="flex-1 border-2 border-green-600 text-green-600 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-green-50 transition-colors">
            📷 Scan Tag
          </button>
          <button onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors">
            + Manual
          </button>
          {items.length > 0 && (
            <button onClick={markPaid} disabled={paying}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">
              {paying ? '...' : '✓ Paid'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BasketPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <BasketContent />
    </Suspense>
  );
}
