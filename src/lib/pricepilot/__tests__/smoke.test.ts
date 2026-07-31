/**
 * Smoke test — verifies that the vitest infrastructure is wired up
 * correctly. Real tests are added in Phase 14.
 */
import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('has access to fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).not.toBeNull();
  });
});
