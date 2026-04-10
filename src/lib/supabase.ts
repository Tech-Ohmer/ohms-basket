import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

// ─── Types matching the Supabase schema ──────────────────────────────────────

export interface SharedBasket {
  id: string;
  room_code: string;
  name: string;
  budget: number;
  created_at: string;
}

export interface SharedItem {
  id: string;
  room_code: string;
  brand: string;
  description: string | null;
  price: number;
  quantity: number;
  added_by: string;
  checked: boolean;
  created_at: string;
}

// ─── Room code generator — 6 char alphanumeric uppercase ─────────────────────

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
