/**
 * Unit tests for src/lib/pricepilot/operation-result.ts
 */

import { describe, it, expect } from 'vitest';
import { ok, retryableError, invalidInputError, wrapPromise, ERROR_CODES } from '../operation-result';

describe('ok', () => {
  it('returns a success result with data', () => {
    const result = ok(42, 'Saved.');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
      expect(result.message).toBe('Saved.');
    }
  });

  it('uses default message', () => {
    const result = ok('test');
    expect(result.message).toBe('Saved.');
  });

  it('returns void data when no data', () => {
    const result = ok(undefined, 'Done');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});

describe('retryableError', () => {
  it('returns a recoverable failure', () => {
    const result = retryableError(ERROR_CODES.DATABASE_ERROR, 'DB failed');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.recoverable).toBe(true);
      expect(result.code).toBe(ERROR_CODES.DATABASE_ERROR);
      expect(result.message).toBe('DB failed');
    }
  });
});

describe('invalidInputError', () => {
  it('returns a non-recoverable failure', () => {
    const result = invalidInputError(ERROR_CODES.VALIDATION_FAILED, 'Invalid input');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.recoverable).toBe(false);
      expect(result.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(result.message).toBe('Invalid input');
    }
  });
});

describe('wrapPromise', () => {
  it('wraps a successful promise', async () => {
    const result = await wrapPromise(Promise.resolve('data'), 'Saved', 'Error');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('data');
      expect(result.message).toBe('Saved');
    }
  });

  it('wraps a rejected promise', async () => {
    const result = await wrapPromise(Promise.reject(new Error('DB error')), 'Saved', 'Error');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.recoverable).toBe(true);
      expect(result.code).toBe(ERROR_CODES.DATABASE_ERROR);
      expect(result.message).toBe('DB error');
    }
  });

  it('wraps a rejected promise with non-Error', async () => {
    const result = await wrapPromise(Promise.reject('string error'), 'Saved', 'Default error');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Default error');
    }
  });

  it('uses default success message', async () => {
    const result = await wrapPromise(Promise.resolve(1));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe('Saved.');
    }
  });
});

describe('ERROR_CODES', () => {
  it('has all expected error codes', () => {
    expect(ERROR_CODES.VALIDATION_FAILED).toBe('validation-failed');
    expect(ERROR_CODES.NORMALIZATION_FAILED).toBe('normalization-failed');
    expect(ERROR_CODES.CALCULATION_FAILED).toBe('calculation-failed');
    expect(ERROR_CODES.DATABASE_ERROR).toBe('database-error');
    expect(ERROR_CODES.BACKUP_FAILED).toBe('backup-failed');
    expect(ERROR_CODES.NOT_FOUND).toBe('not-found');
    expect(ERROR_CODES.UNAUTHORIZED).toBe('unauthorized');
    expect(ERROR_CODES.CONFLICT).toBe('conflict');
  });
});
