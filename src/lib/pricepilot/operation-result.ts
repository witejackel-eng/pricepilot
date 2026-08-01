/**
 * PricePilot - Operation Result
 *
 * Standard result type for every store mutation that touches IndexedDB.
 * Allows callers to:
 *   - `await` the mutation and branch on success/failure
 *   - Show a toast or inline error on failure
 *   - Decide whether to retry, abort, or fall back
 *
 * Design principles:
 *   - On `success: false`, the visible application state is UNCHANGED.
 *     The IndexedDB write either failed or was never attempted
 *     (validation error).
 *   - `recoverable: true` means the user can retry (e.g. transient
 *     IndexedDB error). `recoverable: false` means the input is
 *     invalid and the user must change something.
 *   - `code` is a machine-readable string for telemetry / branching.
 *   - `message` is a user-readable string ready to show in a toast.
 */

export type OperationResult<T = void> =
  | {
      success: true;
      data: T;
      message: string;
    }
  | {
      success: false;
      code: string;
      message: string;
      recoverable: boolean;
    };

/** Common error codes used across store mutations. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'validation-failed',
  NORMALIZATION_FAILED: 'normalization-failed',
  CALCULATION_FAILED: 'calculation-failed',
  DATABASE_ERROR: 'database-error',
  BACKUP_FAILED: 'backup-failed',
  NOT_FOUND: 'not-found',
  UNAUTHORIZED: 'unauthorized',
  CONFLICT: 'conflict',
} as const;

/** Helper: build a success result. */
export function ok<T>(data: T, message = 'Saved.'): OperationResult<T> {
  return { success: true, data, message };
}

/** Helper: build a recoverable failure (transient — user can retry). */
export function retryableError(
  code: string,
  message: string,
): OperationResult<never> {
  return { success: false, code, message, recoverable: true };
}

/** Helper: build a non-recoverable failure (input is invalid). */
export function invalidInputError(
  code: string,
  message: string,
): OperationResult<never> {
  return { success: false, code, message, recoverable: false };
}

/**
 * Wrap any promise into an OperationResult. The promise is expected to
 * resolve with `T` on success. On rejection, the error message is
 * surfaced and the result is marked recoverable (transient errors are
 * the common case for IndexedDB failures).
 */
export async function wrapPromise<T>(
  promise: Promise<T>,
  successMessage = 'Saved.',
  errorMessage = 'PricePilot could not save the change. Please try again.',
): Promise<OperationResult<T>> {
  try {
    const data = await promise;
    return ok(data, successMessage);
  } catch (err) {
    const message = err instanceof Error ? err.message : errorMessage;
    return retryableError(ERROR_CODES.DATABASE_ERROR, message);
  }
}
