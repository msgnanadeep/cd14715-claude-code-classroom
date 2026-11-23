/**
 * Custom error class for review operations
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReviewError';
    Error.captureStackTrace(this, ReviewError);
  }
}

/**
 * Error codes for the review system
 */
export const ErrorCodes = {
  // Configuration errors
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_GITHUB_TOKEN: 'MISSING_GITHUB_TOKEN',
  INVALID_CONFIG: 'INVALID_CONFIG',

  // GitHub errors
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // Agent errors
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_FAILED: 'AGENT_FAILED',
  STRUCTURED_OUTPUT_FAILED: 'STRUCTURED_OUTPUT_FAILED',

  // General errors
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Retry utility with exponential backoff
 *
 * This function implements the retry pattern with exponential backoff and jitter.
 *
 * Algorithm:
 * 1. Try to execute the function
 * 2. If it succeeds, return the result
 * 3. If it fails and retries remain:
 *    - Calculate backoff delay: delayMs * 2^(attempt - 1)
 *    - Add jitter (random 0-100ms) to prevent thundering herd
 *    - Wait for the calculated duration
 *    - Retry
 * 4. If all retries exhausted, throw ReviewError with RETRY_EXHAUSTED code
 *
 * Exponential backoff progression (baseDelay = 1000ms):
 * - Attempt 1: 1000ms (1s)
 * - Attempt 2: 2000ms (2s)
 * - Attempt 3: 4000ms (4s)
 * - Attempt 4: 8000ms (8s)
 *
 * Jitter benefit: Prevents "thundering herd" when multiple clients
 * retry simultaneously. Random variation spreads retry attempts.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Base delay in milliseconds (default: 1000)
 * @returns The result of the successful function execution
 * @throws ReviewError with RETRY_EXHAUSTED code if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchDataFromAPI(),
 *   3,      // max 3 retries
 *   1000    // start with 1 second delay
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  // Attempt 1, 2, 3, ... maxRetries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ✓ SUCCESS: Function executed successfully
      return await fn();
    } catch (error) {
      // Store error for later throwing if all retries exhausted
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we have retries remaining
      if (attempt < maxRetries) {
        // ★ EXPONENTIAL BACKOFF CALCULATION
        // Formula: baseDelay × 2^(attemptNumber - 1)
        // Examples:
        // - Attempt 1: 1000 × 2^0 = 1000ms
        // - Attempt 2: 1000 × 2^1 = 2000ms
        // - Attempt 3: 1000 × 2^2 = 4000ms
        const exponentialBackoff = delayMs * Math.pow(2, attempt - 1);

        // ★ ADD JITTER TO PREVENT THUNDERING HERD
        // Spread out retry attempts across a small random interval (0-100ms)
        // Benefit: If 100 clients all fail and retry, they don't all hit
        // the service at exactly the same millisecond. Instead, they're
        // spread over 100ms, reducing server load spike.
        const jitter = Math.random() * 100;

        // Total delay before next retry attempt
        const totalDelayMs = exponentialBackoff + jitter;

        // ★ WAIT USING PROMISE-BASED TIMEOUT
        // Pattern: new Promise(resolve => setTimeout(resolve, ms))
        // This wraps setTimeout in a Promise so we can use async/await
        // The Promise resolves after totalDelayMs milliseconds
        await new Promise(resolve => setTimeout(resolve, totalDelayMs));

        // Continue loop to next attempt
        continue;
      }
    }
  }

  // ✗ ALL RETRIES EXHAUSTED
  // We've tried maxRetries times and all failed
  // Throw ReviewError with RETRY_EXHAUSTED code
  throw new ReviewError(
    `Operation failed after ${maxRetries} retries. Last error: ${lastError?.message || 'Unknown'}`,
    ErrorCodes.RETRY_EXHAUSTED,
    {
      maxRetries,
      baseDelayMs: delayMs,
      lastError: lastError?.message
    }
  );
}

/**
 * Wrap an async function with timeout
 *
 * This function races the provided function against a timeout.
 * Whichever completes first wins.
 *
 * Promise.race() behavior:
 * - Returns/throws as soon as the first Promise settles
 * - If function completes first → returns result
 * - If timeout triggers first → rejects with timeout error
 *
 * Use cases:
 * - Prevent hanging agent calls (agent SDK query could hang)
 * - Enforce SLA (must complete within X milliseconds)
 * - User experience (timeout is better than infinite wait)
 *
 * @param fn - Async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message (default: "Operation timed out")
 * @returns The result of the function if it completes before timeout
 * @throws ReviewError with AGENT_TIMEOUT code if timeout is reached
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => queryOrchestrator(owner, repo, prNumber),
 *   120000, // 2 minute timeout
 *   'Orchestrator analysis timed out'
 * );
 * ```
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  // ★ CREATE TIMEOUT PROMISE THAT REJECTS AFTER timeoutMs
  // This Promise:
  // 1. Never resolves (stays pending forever)
  // 2. Rejects after timeoutMs milliseconds
  // 3. Used in Promise.race() to enforce deadline
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(
        new ReviewError(
          errorMessage,
          ErrorCodes.AGENT_TIMEOUT,
          { timeoutMs }
        )
      );
    }, timeoutMs);
  });

  // ★ RACE THE FUNCTION AGAINST TIMEOUT
  // Promise.race() returns/throws as soon as any Promise settles:
  // - If fn() resolves first → returns result (function wins)
  // - If timeoutPromise rejects first → throws timeout error (timeout wins)
  //
  // Example race results:
  // - fn() takes 100ms, timeout=5000ms → fn() wins, returns result
  // - fn() takes 10000ms, timeout=5000ms → timeout wins, throws error
  // - fn() throws error at 100ms, timeout=5000ms → error thrown immediately
  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Check if an error is a ReviewError
 */
export function isReviewError(error: unknown): error is ReviewError {
  return error instanceof ReviewError;
}

/**
 * Format error for logging/display
 */
export function formatError(error: unknown): string {
  if (isReviewError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}