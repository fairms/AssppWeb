import { create } from "zustand";
import { openDB, type IDBPDatabase } from "idb";
import type { Account } from "../types";

const DB_NAME = "asspp-accounts";
const STORE_NAME = "accounts";

// iOS Safari evicts IndexedDB for sites that go unvisited, and a database left
// half-written by that eviction makes `indexedDB.open()` fail outright or hang
// without ever settling. Neither may leave the UI stuck on a loading state, so
// opening is bounded by a timeout and falls back to recreating the database.
const OPEN_TIMEOUT_MS = 8000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function openWithTimeout(): Promise<IDBPDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error("IndexedDB open timed out"))),
      OPEN_TIMEOUT_MS,
    );

    openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "email" });
        }
      },
      blocked() {
        // Another tab is holding an older version open. Waiting is the only
        // option; the timeout above keeps that bounded.
      },
      blocking() {
        // This connection is holding up an upgrade elsewhere — release it.
        void dbPromise?.then((db) => db.close()).catch(() => {});
      },
      terminated() {
        // The browser killed the connection (storage eviction). Drop the cached
        // promise so the next call opens a fresh one.
        dbPromise = null;
      },
    }).then(
      (db: IDBPDatabase) => finish(() => resolve(db)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openWithTimeout().catch(async () => {
      // Most likely a database left half-written by eviction. Recreate it once.
      dbPromise = null;
      await deleteDatabase();
      return openWithTimeout();
    });

    // Never cache a rejected promise, or every later call fails instantly.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }

  return dbPromise;
}

/**
 * Keeps only entries that still look like an account. Rows written by an older
 * build can outlive a schema change, and passing them through would push the
 * failure into rendering.
 */
function sanitizeAccounts(rows: unknown[]): Account[] {
  return rows.filter(
    (row): row is Account =>
      typeof row === "object" &&
      row !== null &&
      typeof (row as { email?: unknown }).email === "string" &&
      (row as { email: string }).email.length > 0,
  );
}

interface AccountsState {
  accounts: Account[];
  loading: boolean;
  loadAccounts: () => Promise<void>;
  addAccount: (account: Account) => Promise<void>;
  removeAccount: (email: string) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  loading: true,

  loadAccounts: async () => {
    set({ loading: true });
    try {
      const db = await getDB();
      const rows = (await db.getAll(STORE_NAME)) as unknown[];
      set({ accounts: sanitizeAccounts(rows), loading: false });
    } catch (error) {
      // Storage is unusable. An empty list is a working app; a stuck spinner
      // is not.
      console.warn("Could not read accounts from IndexedDB", error);
      set({ accounts: [], loading: false });
    }
  },

  addAccount: async (account: Account) => {
    const db = await getDB();
    await db.put(STORE_NAME, account);
    set({
      accounts: [
        ...get().accounts.filter((a) => a.email !== account.email),
        account,
      ],
    });
  },

  removeAccount: async (email: string) => {
    const db = await getDB();
    await db.delete(STORE_NAME, email);
    set({ accounts: get().accounts.filter((a) => a.email !== email) });
  },

  updateAccount: async (account: Account) => {
    const db = await getDB();
    await db.put(STORE_NAME, account);
    set({
      accounts: get().accounts.map((a) =>
        a.email === account.email ? account : a,
      ),
    });
  },
}));

// Auto-load accounts on import. `loadAccounts` handles its own failures; the
// extra catch is here so an unexpected throw can never become an unhandled
// rejection during module evaluation.
void useAccountsStore
  .getState()
  .loadAccounts()
  .catch((error) => console.warn("Account auto-load failed", error));
