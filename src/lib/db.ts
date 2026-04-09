import Dexie, { type EntityTable } from 'dexie';

export interface Trip {
  id: string;
  date: string;         // ISO string
  store: string;
  budget: number;       // PHP
  total: number;        // PHP
  paid: boolean;
  syncedAt?: string;
}

export interface BasketItem {
  id: string;
  tripId: string;
  brand: string;
  description: string;
  price: number;        // PHP per unit
  quantity: number;
}

export interface PriceRecord {
  id: string;
  brand: string;
  description: string;
  price: number;
  store: string;
  date: string;         // ISO string
}

class OhmsBasketDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  basketItems!: EntityTable<BasketItem, 'id'>;
  priceRecords!: EntityTable<PriceRecord, 'id'>;

  constructor() {
    super('OhmsBasketDB');
    this.version(1).stores({
      trips: 'id, date, store, paid',
      basketItems: 'id, tripId, brand',
      priceRecords: 'id, brand, store, date',
    });
  }
}

export const db = new OhmsBasketDB();
