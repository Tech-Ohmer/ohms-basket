'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, generateRoomCode, type SharedBasket, type SharedItem } from '@/lib/supabase';

// ─── Nickname storage ─────────────────────────────────────────────────────────

function getNickname(): string {
  if (typeof window === 'undefined') return 'Guest';
  const saved = localStorage.getItem('ohms-basket-nickname');
  if (saved) return saved;
  const generated = 'Guest' + Math.floor(Math.random() * 9000 + 1000);
  localStorage.setItem('ohms-basket-nickname', generated);
  return generated;
}

function setNickname(name: string) {
  localStorage.setItem('ohms-basket-nickname', name.trim() || getNickname());
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SharedBasketPage() {
  const router = useRouter();
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [basket, setBasket] = useState<SharedBasket | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lobby state
  const [nickname, setNicknameState] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomBudget, setRoomBudget] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyTab, setLobbyTab] = useState<'create' | 'join'>('create');

  // Room add-item state
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [showAdd, setShowAdd] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load nickname on mount
  useEffect(() => {
    setNicknameState(getNickname());
  }, []);

  // ── Real-time subscription ──────────────────────────────────────────────────
  const subscribeToRoom = useCallback((roomCode: string) => {
    // Unsubscribe from any previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shared_items',
        filter: `room_code=eq.${roomCode}`,
      }, () => {
        // Reload items on any change
        loadItems(roomCode);
      })
      .subscribe();

    channelRef.current = channel;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Load items ──────────────────────────────────────────────────────────────
  const loadItems = async (roomCode: string) => {
    const { data } = await supabase
      .from('shared_items')
      .select('*')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });
    setItems(data ?? []);
  };

  // ── Create room ─────────────────────────────────────────────────────────────
  const createRoom = async () => {
    if (!roomName.trim() || !roomBudget) return;
    setLoading(true);
    setError('');
    const nick = nickname.trim() || getNickname();
    setNickname(nick);
    setNicknameState(nick);

    const code = generateRoomCode();
    const { data, error: err } = await supabase
      .from('shared_baskets')
      .insert({ room_code: code, name: roomName.trim(), budget: Number(roomBudget) })
      .select()
      .single();

    if (err) { setError('Could not create room. Try again.'); setLoading(false); return; }
    setBasket(data);
    await loadItems(code);
    subscribeToRoom(code);
    setView('room');
    setLoading(false);
  };

  // ── Join room ───────────────────────────────────────────────────────────────
  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError('');
    const nick = nickname.trim() || getNickname();
    setNickname(nick);
    setNicknameState(nick);

    const { data, error: err } = await supabase
      .from('shared_baskets')
      .select('*')
      .eq('room_code', code)
      .single();

    if (err || !data) {
      setError(`Room "${code}" not found. Check the code and try again.`);
      setLoading(false);
      return;
    }
    setBasket(data);
    await loadItems(code);
    subscribeToRoom(code);
    setView('room');
    setLoading(false);
  };

  // ── Add item ────────────────────────────────────────────────────────────────
  const addItem = async () => {
    if (!brand.trim() || !price || !basket) return;
    const { error: err } = await supabase.from('shared_items').insert({
      room_code: basket.room_code,
      brand: brand.trim(),
      description: description.trim() || null,
      price: Number(price),
      quantity: Number(qty) || 1,
      added_by: nickname || getNickname(),
      checked: false,
    });
    if (!err) {
      setBrand(''); setDescription(''); setPrice(''); setQty('1');
      setShowAdd(false);
    }
  };

  // ── Toggle checked ──────────────────────────────────────────────────────────
  const toggleCheck = async (item: SharedItem) => {
    await supabase
      .from('shared_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);
  };

  // ── Delete item ─────────────────────────────────────────────────────────────
  const deleteItem = async (id: string) => {
    await supabase.from('shared_items').delete().eq('id', id);
  };

  // ── Leave room ──────────────────────────────────────────────────────────────
  const leaveRoom = () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    setBasket(null);
    setItems([]);
    setView('lobby');
    setJoinCode('');
    setRoomName('');
    setRoomBudget('');
    setShowAdd(false);
  };

  const total = items.filter(i => !i.checked).reduce((s, i) => s + i.price * i.quantity, 0);
  const checkedTotal = items.filter(i => i.checked).reduce((s, i) => s + i.price * i.quantity, 0);
  const remaining = basket ? basket.budget - (total + checkedTotal) : 0;
  const spentPct = basket && basket.budget > 0
    ? Math.min(((total + checkedTotal) / basket.budget) * 100, 100)
    : 0;

  // ── Lobby view ──────────────────────────────────────────────────────────────
  if (view === 'lobby') {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="bg-green-600 text-white px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-green-100 hover:text-white text-xl">←</button>
          <div>
            <h1 className="font-bold text-lg">Shared Basket</h1>
            <p className="text-green-100 text-xs">Shop together in real-time</p>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
          {/* Nickname */}
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
            <label className="text-sm font-medium text-slate-600 block mb-1">Your name (shown to others)</label>
            <input type="text" value={nickname}
              onChange={e => setNicknameState(e.target.value)}
              onBlur={e => setNickname(e.target.value)}
              placeholder="e.g. Mama, Papa, Ate Joy"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
            <button onClick={() => setLobbyTab('create')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${lobbyTab === 'create' ? 'bg-white shadow-sm text-green-700' : 'text-slate-500'}`}>
              Create Room
            </button>
            <button onClick={() => setLobbyTab('join')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${lobbyTab === 'join' ? 'bg-white shadow-sm text-green-700' : 'text-slate-500'}`}>
              Join Room
            </button>
          </div>

          {lobbyTab === 'create' ? (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm text-slate-500 mb-4">
                Create a shared basket — a room code will be generated. Share it with your family so they can join and add items in real-time.
              </p>
              <input type="text" placeholder="Basket name (e.g. Weekend Groceries)" value={roomName}
                onChange={e => setRoomName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-green-500" />
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₱</span>
                <input type="number" inputMode="decimal" placeholder="Total budget (optional)" value={roomBudget}
                  onChange={e => setRoomBudget(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <button onClick={createRoom} disabled={!roomName.trim() || loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-base transition-colors">
                {loading ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-sm text-slate-500 mb-4">
                Enter the 6-character room code shared by whoever created the basket.
              </p>
              <input type="text" placeholder="Room code (e.g. A3K9MP)" value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base text-center tracking-widest font-mono uppercase mb-4 focus:outline-none focus:ring-2 focus:ring-green-500" />
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <button onClick={joinRoom} disabled={joinCode.length < 3 || loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-base transition-colors">
                {loading ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Room view ───────────────────────────────────────────────────────────────
  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-green-600 text-white px-4 py-3 shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={leaveRoom} className="text-green-100 hover:text-white text-xl">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{basket?.name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-green-100 text-xs">Code:</span>
              <span className="font-mono font-bold text-sm tracking-widest bg-green-700 px-2 py-0.5 rounded-lg">
                {basket?.room_code}
              </span>
              <button onClick={() => navigator.clipboard?.writeText(basket?.room_code ?? '')}
                className="text-xs text-green-200 underline">copy</button>
            </div>
          </div>
          <button onClick={() => { setShowAdd(true); }}
            className="bg-white text-green-700 font-bold px-3 py-1.5 rounded-xl text-sm flex-shrink-0">
            + Add
          </button>
        </div>

        {/* Budget bar */}
        {basket && basket.budget > 0 && (
          <div>
            <div className="flex justify-between text-xs text-green-100 mb-1">
              <span>Spent: ₱{(total + checkedTotal).toFixed(2)}</span>
              <span>{remaining >= 0 ? `₱${remaining.toFixed(2)} left` : `₱${Math.abs(remaining).toFixed(2)} over`}</span>
            </div>
            <div className="w-full bg-green-800 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${spentPct >= 100 ? 'bg-red-400' : spentPct >= 85 ? 'bg-amber-300' : 'bg-white'}`}
                style={{ width: `${spentPct}%` }} />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full overflow-y-auto">
        {/* Add item form */}
        {showAdd && (
          <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
            <h3 className="font-semibold text-slate-700 mb-3">Add Item</h3>
            <input type="text" placeholder="Brand / Item name *" value={brand} autoFocus
              onChange={e => setBrand(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base mb-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="text" placeholder="Description (optional)" value={description}
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
              <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm">Cancel</button>
              <button onClick={addItem} disabled={!brand.trim() || !price}
                className="flex-1 bg-green-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold">Add</button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-3">🧺</p>
            <p className="text-sm font-medium">Basket is empty</p>
            <p className="text-xs mt-1">Share the room code <span className="font-mono font-bold text-slate-600">{basket?.room_code}</span> with your family</p>
            <p className="text-xs">and everyone can add items here in real-time!</p>
          </div>
        ) : (
          <>
            {/* Pending items */}
            {unchecked.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  To buy ({unchecked.length}) · ₱{total.toFixed(2)}
                </p>
                {unchecked.map(item => (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
                    <button onClick={() => toggleCheck(item)}
                      className="w-6 h-6 rounded-full border-2 border-slate-300 flex-shrink-0 hover:border-green-500 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 truncate">{item.brand}</p>
                      {item.description && <p className="text-xs text-slate-400 truncate">{item.description}</p>}
                      <p className="text-xs text-slate-400">
                        ₱{item.price.toFixed(2)} × {item.quantity}
                        <span className="ml-2 text-slate-300">· {item.added_by}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-bold text-green-700">₱{(item.price * item.quantity).toFixed(2)}</p>
                      <button onClick={() => deleteItem(item.id)}
                        className="text-slate-200 hover:text-red-400 transition-colors text-lg">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Checked/done items */}
            {checked.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Done ({checked.length}) · ₱{checkedTotal.toFixed(2)}
                </p>
                <div className="space-y-2">
                  {checked.map(item => (
                    <div key={item.id} className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center gap-3 opacity-60">
                      <button onClick={() => toggleCheck(item)}
                        className="w-6 h-6 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                        ✓
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-500 truncate line-through">{item.brand}</p>
                        <p className="text-xs text-slate-400">
                          ₱{item.price.toFixed(2)} × {item.quantity}
                          <span className="ml-2">· {item.added_by}</span>
                        </p>
                      </div>
                      <p className="font-bold text-slate-400 flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
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
