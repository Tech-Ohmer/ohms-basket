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

export interface ShoppingListItem {
  id: string;
  brand: string;
  description: string;
  estimatedPrice: number;
  quantity: number;
  checked: boolean;
  createdAt: string;    // ISO string
}

export interface MonthlyBudget {
  id: string;           // format: "YYYY-MM"
  budget: number;       // PHP
}

class OhmsBasketDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  basketItems!: EntityTable<BasketItem, 'id'>;
  priceRecords!: EntityTable<PriceRecord, 'id'>;
  shoppingList!: EntityTable<ShoppingListItem, 'id'>;
  monthlyBudgets!: EntityTable<MonthlyBudget, 'id'>;

  constructor() {
    super('OhmsBasketDB');
    this.version(1).stores({
      trips: 'id, date, store, paid',
      basketItems: 'id, tripId, brand',
      priceRecords: 'id, brand, store, date',
    });
    // v2: add shopping list + monthly budgets
    this.version(2).stores({
      trips: 'id, date, store, paid',
      basketItems: 'id, tripId, brand',
      priceRecords: 'id, brand, store, date',
      shoppingList: 'id, checked, createdAt',
      monthlyBudgets: 'id',
    });
  }
}

export const db = new OhmsBasketDB();
