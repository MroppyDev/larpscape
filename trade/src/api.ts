// Larpscape Trade — API client for the /api/market/* + /api/ge/* endpoints.
// Contract: docs/MARKET-API.md. Cookie sessions (bs_session, Domain=.larpscape.net);
// every request sends credentials:'include' and CSRF is satisfied by the
// Origin-host check (we are a *.larpscape.net page).

export type EffectToken = 'poison' | 'burn' | 'bleed' | 'freeze' | 'lifesteal' | 'family_bane';

export interface ItemMeta {
  id: string;
  name: string;
  slot: string | null;
  levelReq: number;
  effects: EffectToken[];
  spec: string | null;
  bonuses: { att: number; str: number; ranged: number; mage: number; gun: number };
  attackSpeed: number | null;
  stackable: boolean;
  value: number;
}

export interface Listing {
  id: number;
  item: string;
  name: string;
  qty: number;
  price: number;     // TOTAL coins for the whole listing
  pricePer: number;
  createdAt: number; // ms epoch
  status: 'active' | 'sold' | 'cancelled';
  soldAt: number | null;
  seller: string;
  sellerOnline?: boolean;
  meta: {
    slot: string | null;
    levelReq: number;
    levelReqs: { skill: string; level: number }[];
    effects: EffectToken[];
    spec: string | null;
    bonuses: { att: number; str: number; ranged: number; mage: number; gun: number };
    attackSpeed: number | null;
    stackable: boolean;
    value: number;
  };
}

export interface SearchResult {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  listings: Listing[];
}

export interface SearchParams {
  name?: string;
  slot?: string;
  effect?: string;
  hasSpec?: boolean;
  maxLevelReq?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price' | 'age';
  page?: number;
}

export interface GeOffer {
  id: number;
  kind: 'buy' | 'sell';
  item: string;
  qty: number;
  price: number;
  filled: number;
  collectedQty: number;
  coinsOwed: number;
  itemsOwed: number;
  active: boolean;
}

export interface HistoryDay { date: string; avgPrice: number; volume: number }

export interface BankStack { id: string; qty: number }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'include', ...init });
  } catch {
    throw new ApiError(0, 'Could not reach the realm — check your connection.');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Something went wrong (${res.status}).`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---- session -------------------------------------------------------------

/** GET /api/me — resolves the logged-in username, or null. Never throws. */
export async function apiMe(): Promise<string | null> {
  try {
    const data = await request<{ username?: unknown }>('/api/me');
    return typeof data.username === 'string' ? data.username : null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try { await post('/api/auth/logout'); } catch { /* best-effort */ }
}

// ---- item catalogue (public, 1h cache server-side; memoized here) --------

let itemsPromise: Promise<ItemMeta[]> | null = null;
let itemsById: Map<string, ItemMeta> | null = null;

export function getItems(): Promise<ItemMeta[]> {
  if (!itemsPromise) {
    itemsPromise = request<{ items: ItemMeta[] }>('/api/market/items').then((d) => {
      itemsById = new Map(d.items.map((m) => [m.id, m]));
      return d.items;
    });
    itemsPromise.catch(() => { itemsPromise = null; }); // allow retry on failure
  }
  return itemsPromise;
}

export function itemMeta(id: string): ItemMeta | null {
  return itemsById?.get(id) ?? null;
}

// ---- market --------------------------------------------------------------

export function search(params: SearchParams): Promise<SearchResult> {
  const q = new URLSearchParams();
  if (params.name) q.set('name', params.name);
  if (params.slot) q.set('slot', params.slot);
  if (params.effect) q.set('effect', params.effect);
  if (params.hasSpec) q.set('hasSpec', '1');
  if (params.maxLevelReq !== undefined) q.set('maxLevelReq', String(params.maxLevelReq));
  if (params.minPrice !== undefined) q.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) q.set('maxPrice', String(params.maxPrice));
  if (params.sort) q.set('sort', params.sort);
  if (params.page) q.set('page', String(params.page));
  const qs = q.toString();
  return request<SearchResult>(`/api/market/search${qs ? `?${qs}` : ''}`);
}

export function listItem(item: string, qty: number, price: number): Promise<{ listing: Listing }> {
  return post('/api/market/list', { item, qty, price });
}

export function buyListing(id: number): Promise<{ listing: Listing }> {
  return post('/api/market/buy', { id });
}

export function cancelListing(id: number): Promise<{ listing: Listing }> {
  return post('/api/market/cancel', { id });
}

export function collectProceeds(): Promise<{ collected: number; remaining: number }> {
  return post('/api/market/collect');
}

export function myListings(): Promise<{ listings: Listing[] }> {
  return request('/api/market/mine');
}

export function myProceeds(): Promise<{ coins: number }> {
  return request('/api/market/proceeds');
}

// ---- character bank (sell flow) -------------------------------------------

/** GET /api/character — pulls save.bank ([{id, qty}...]) for the sell picker. */
export async function getBank(): Promise<BankStack[] | null> {
  const data = await request<{ save: { bank?: unknown } | null }>('/api/character');
  const bank = data.save?.bank;
  if (!Array.isArray(bank)) return null;
  return bank.filter(
    (s): s is BankStack =>
      !!s && typeof s === 'object' &&
      typeof (s as BankStack).id === 'string' &&
      typeof (s as BankStack).qty === 'number' && (s as BankStack).qty > 0
  );
}

// ---- exchange (Aldgate Exchange, read-side) --------------------------------

export function geHistory(item: string): Promise<{ item: string; days: HistoryDay[] }> {
  return request(`/api/ge/history/${encodeURIComponent(item)}`);
}

let pricesPromise: Promise<Record<string, number>> | null = null;
export function gePrices(): Promise<Record<string, number>> {
  if (!pricesPromise) {
    pricesPromise = request<{ prices: Record<string, number> }>('/api/ge/prices').then((d) => d.prices);
    pricesPromise.catch(() => { pricesPromise = null; });
  }
  return pricesPromise;
}

export function geOffers(): Promise<{ offers: GeOffer[] }> {
  return request('/api/ge/offers');
}
