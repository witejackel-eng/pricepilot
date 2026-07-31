/**
 * Vitest setup — runs before every test file.
 *
 * - Registers fake-indexeddb so database tests work in jsdom.
 * - Registers @testing-library/jest-dom matchers.
 * - Suppresses noisy console.warn / console.error from expected
 *   warnings during tests (we still assert on them explicitly).
 */

import { beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// Reset the IndexedDB between tests so each test starts fresh.
beforeEach(() => {
  // fake-indexeddb auto-registers a global indexedDB. Clearing all
  // databases between tests ensures isolation.
  // We can't easily enumerate + delete all DBs, so we just clear the
  // most common one ('pricepilot').
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('pricepilot');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
    // Safety timeout in case the delete is blocked.
    setTimeout(() => resolve(), 200);
  });
});
