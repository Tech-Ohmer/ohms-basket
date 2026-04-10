'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, type ShoppingListItem } from '@/lib/db';

export default function ShoppingListPage() {
  const router = useRouter();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await db.shoppingList.orderBy('createdAt').toArray();
    // Unchecked first, then checked
    all.sort((a, b) => Number(a.checked) - Number(b.checked));
    setItems(all);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!brand.trim()) return;
    const item: ShoppingListItem = {
      id: crypto.randomUUID(),
      brand: brand.trim(),
      description: description.trim(),
      estimatedPrice: Number(estimatedPrice) || 0,
      quantity: Number(qty) || 1,
      checked: false,
      createdAt: new Date().toISOString(),
    };
    await db.shoppingList.put(item);
    setBrand(''); setDescription(''); setEstimatedPrice(''); setQty('1');
    setShowAdd(false);
    load();
  };

  const toggleCheck = async (item: ShoppingListItem) => {
    await db.shoppingList.put({ ...item, checked: !item.checked });
    load();
  };

  const deleteItem = async (id: string) => {
    await db.shoppingList.delete(id);
    load();
  };

  const clearChecked = async () => {
    const checked = items.filter(i => i.checked).map(i => i.id);
    await db.shoppingList.bulkDelete(checked);
    load();
  };

  const uncheckedCount = items.filter(i => !i.checked).length;
  const checkedCount = items.filter(i => i.checked).length;
  const estimatedTotal = items
    .filter(i => !i.checked && i.estimatedPrice > 0)
    .reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
          <div>
            <h1 className="font-bold text-lg">Shopping List</h1>
            <p className="text-green-100 text-xs">
              {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} to buy
              {estimatedTotal > 0 ? ` · Est. ₱${estimatedTotal.toFixed(2)}` : ''}
            </p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-white text-green-700 font-bold px-3 py-1.5 rounded-xl text-sm">
          + Add
        </button>
      </header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
            <h3 className="font-semibold text-slate-700 mb-3">Add to List</h3>
            <input type="text" placeholder="Brand / Item name *" value={brand}
              onChange={e => setBrand(e.target.value)} autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="text" placeholder="Description (optional)" value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                <input type="number" inputMode="decimal" placeholder="Est. price" value={estimatedPrice}
                  onChange={e => setEstimatedPrice(e.target.value)}
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
              <button onClick={addItem} disabled={!brand.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold">Add</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm">Your shopping list is empty.</p>
            <p className="text-xs mt-1">Add items to plan your next trip!</p>
          </div>
        ) : (
          <>
            {/* Unchecked items */}
            {items.filter(i => !i.checked).length > 0 && (
              <div className="space-y-2 mb-4">
                {items.filter(i => !i.checked).map(item => (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                    {/* Checkbox */}
                    <button onClick={() => toggleCheck(item)}
                      className="w-6 h-6 rounded-full border-2 border-slate-300 flex-shrink-0 flex items-center justify-center hover:border-green-500 transition-colors" />

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 truncate">{item.brand}</p>
                      {item.description && <p className="text-xs text-slate-400 truncate">{item.description}</p>}
                      <p className="text-xs text-slate-400">
                        Qty: {item.quantity}
                        {item.estimatedPrice > 0 && ` · Est. ₱${(item.estimatedPrice * item.quantity).toFixed(2)}`}
                      </p>
                    </div>
                    <button onClick={() => deleteItem(item.id)}
                      className="text-slate-200 hover:text-red-400 transition-colors text-lg flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Checked items */}
            {items.filter(i => i.checked).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Done ({checkedCount})
                  </p>
                  <button onClick={clearChecked}
                    className="text-xs text-red-400 font-medium hover:underline">
                    Clear all done
                  </button>
                </div>
                <div className="space-y-2">
                  {items.filter(i => i.checked).map(item => (
                    <div key={item.id} className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center gap-3 opacity-60">
                      {/* Checked circle */}
                      <button onClick={() => toggleCheck(item)}
                        className="w-6 h-6 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                        ✓
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-500 truncate line-through">{item.brand}</p>
                        {item.description && <p className="text-xs text-slate-400 truncate">{item.description}</p>}
                      </div>
                      <button onClick={() => deleteItem(item.id)}
                        className="text-slate-200 hover:text-red-400 transition-colors text-lg flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
