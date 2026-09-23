// Recovery helpers for the two ways a SPA turns into a blank white page:
//
//  1. A stale document / chunk pair. The browser keeps an old index.html (or
//     an old hashed chunk) across a redeploy, the dynamic import 404s, the
//     lazy route rejects, and — with no error boundary — React unmounts the
//     whole tree. Private browsing is unaffected because it starts with an
//     empty cache, which is exactly the "works in private, blank normally"
//     signature.
//  2. Corrupted or evicted local storage. iOS Safari evicts IndexedDB for
//     sites that have not been visited for a while, and a half-evicted
//     database makes `indexedDB.open()` fail or hang.
//
// Both are fixed by throwing away the local state and loading fresh bytes.

/** IndexedDB databases this app owns, used when enumeration is unavailable. */
const KNOWN_DATABASES = ["asspp-accounts"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Drops every piece of client-side state this app can create: web storage,
 * Cache API entries, IndexedDB databases and service worker registrations.
 * Every step is best-effort — a browser that blocks one of them must not stop
 * the others.
 */
export async function clearSiteData(): Promise<void> {
  try {
    localStorage.clear();
  } catch {
    // Storage disabled — nothing to clear.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Storage disabled — nothing to clear.
  }

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache API unavailable (private mode) or blocked.
  }

  try {
    if (typeof indexedDB !== "undefined") {
      // `indexedDB.databases()` is unavailable on older Safari, hence the
      // known-name fallback.
      let names: string[] = KNOWN_DATABASES;
      try {
        const listed = await indexedDB.databases?.();
        if (listed && listed.length) {
          names = listed
            .map((entry) => entry.name)
            .filter((name): name is string => Boolean(name));
        }
      } catch {
        // Keep the fallback list.
      }
      await Promise.all(names.map((name) => deleteDatabase(name)));
    }
  } catch {
    // IndexedDB unavailable or blocked.
  }

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).map((reg) => reg.unregister()));
  } catch {
    // No service worker support.
  }
}

/**
 * Reloads the document, bypassing any cached copy. Safari ignores the legacy
 * `location.reload(true)` force flag, so a one-shot query parameter is used to
 * make the document URL itself a cache miss.
 */
export function hardReload(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/** Clears local state, then reloads fresh. */
export async function resetAndReload(): Promise<void> {
  await clearSiteData();
  hardReload();
}

const RELOAD_GUARD_KEY = "asspp-preload-reloaded";

/**
 * Recovers from a failed dynamic import automatically.
 *
 * Vite dispatches `vite:preloadError` when a lazily imported chunk cannot be
 * fetched — the usual outcome of an old document referencing chunks that no
 * longer exist after a deploy. A single silent reload picks up the current
 * build; the guard stops a reload loop when the network itself is down.
 */
export function installPreloadErrorRecovery(): void {
  // An in-memory flag backs up the persisted one, so a browser that refuses
  // storage access still cannot end up in a reload loop.
  let retriedThisLoad = false;

  window.addEventListener("vite:preloadError", () => {
    if (retriedThisLoad) {
      return;
    }

    let retriedThisSession = false;
    try {
      retriedThisSession = sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
    } catch {
      // Storage unavailable — the in-memory flag is the only guard.
    }
    if (retriedThisSession) {
      return;
    }

    retriedThisLoad = true;
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
      // Ignore — the in-memory flag already covers this load.
    }
    hardReload();
  });
}
