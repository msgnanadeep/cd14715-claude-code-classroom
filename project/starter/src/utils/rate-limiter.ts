/**
 * Rate Limiter for API requests and token usage
 * Prevents exceeding Anthropic API rate limits
 *
 * This implements a token bucket algorithm with sliding window.
 *
 * Concepts:
 * - Tracks requests and tokens used in the last 60 seconds (sliding window)
 * - Limits concurrent requests to prevent overwhelming the API
 * - Uses token estimation to prevent exceeding token-per-minute limits
 */

export interface RateLimiterConfig {
  /** Maximum requests per minute */
  maxRequestsPerMinute: number;
  /** Maximum tokens per minute */
  maxTokensPerMinute: number;
  /** Maximum concurrent requests */
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,      // Conservative default
  maxTokensPerMinute: 100000,    // ~100k tokens/min
  maxConcurrent: 5               // Max parallel requests
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

/**
 * Token bucket rate limiter with sliding window
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests: number = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
  }

  /**
   * Wait until a request can be made within rate limits
   *
   * This is the main entry point for rate limiting.
   * It ensures:
   * 1. Concurrent request limit is not exceeded
   * 2. Request and token rate limits are respected
   * 3. The request is recorded for future rate limit calculations
   *
   * Flow:
   * 1. If concurrent limit reached, wait for a slot to open
   * 2. If rate limits exceeded, wait until old requests expire
   * 3. Record this request in history
   * 4. Increment active request counter
   *
   * @param estimatedTokens - Estimated tokens for this request
   *
   * @example
   * ```typescript
   * const limiter = new RateLimiter();
   *
   * // Before making API call:
   * await limiter.acquire(1500);  // Wait if necessary
   *
   * try {
   *   const result = await apiCall();
   *   limiter.release(actualTokens);  // Update with actual count
   * } catch (error) {
   *   limiter.release();  // Still release slot
   *   throw error;
   * }
   * ```
   */
  async acquire(estimatedTokens: number = 1000): Promise<void> {
    // ★ STEP 1: WAIT FOR CONCURRENT REQUEST SLOT
    // If we're already at max concurrent requests,
    // wait for another request to complete (via release())
    // Uses queue pattern: waitForSlot adds resolve to waitQueue,
    // release() dequeues and calls it
    while (this.activeRequests >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    // ★ STEP 2: WAIT FOR RATE LIMIT AVAILABILITY
    // Check if request and token limits allow this request
    // If not, wait until the oldest request expires (falls out of 60-sec window)
    await this.waitForRateLimit(estimatedTokens);

    // ★ STEP 3: RECORD THIS REQUEST IN HISTORY
    // Add timestamp and estimated token count
    // This is used by canProceed() to check future rate limits
    this.requestHistory.push({
      timestamp: Date.now(),
      tokens: estimatedTokens
    });

    // ★ STEP 4: INCREMENT ACTIVE REQUEST COUNTER
    // Track that we now have one more concurrent request
    this.activeRequests++;
  }

  /**
   * Release a request slot after completion
   * @param actualTokens - Actual tokens used (updates estimate)
   */
  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Update last request with actual token count if provided
    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.tokens = actualTokens;
      }
    }

    // Wake up next waiting request
    const next = this.waitQueue.shift();
    if (next) next();
  }

  /**
   * Get current rate limit status
   */
  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce((sum, r) => sum + r.tokens, 0);

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(0, this.config.maxRequestsPerMinute - requestsInWindow),
      availableTokens: Math.max(0, this.config.maxTokensPerMinute - tokensInWindow)
    };
  }

  /**
   * Check if request can proceed immediately
   *
   * This checks all three rate limit constraints:
   * 1. Concurrent requests limit
   * 2. Requests per minute limit
   * 3. Tokens per minute limit
   *
   * @param estimatedTokens - Estimated tokens for the request
   * @returns true if the request can proceed without waiting
   *
   * @example
   * ```typescript
   * if (rateLimiter.canProceed(1000)) {
   *   // Request can proceed immediately
   * } else {
   *   // Need to wait
   * }
   * ```
   */
  canProceed(estimatedTokens: number = 1000): boolean {
    // ★ STEP 1: PRUNE OLD RECORDS
    // Remove any requests older than 60 seconds
    // This ensures we only count requests in the sliding window
    this.pruneOldRecords();

    // ★ STEP 2: CHECK CONCURRENT REQUESTS LIMIT
    // Can't exceed maximum concurrent requests
    if (this.activeRequests >= this.config.maxConcurrent) {
      return false;
    }

    // ★ STEP 3: COUNT REQUESTS IN CURRENT WINDOW
    // Calculate how many requests were made in the last 60 seconds
    const requestsInWindow = this.requestHistory.length;

    // ★ STEP 4: COUNT TOKENS IN CURRENT WINDOW
    // Sum up all tokens used by requests in the last 60 seconds
    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    // ★ STEP 5: CHECK ALL RATE LIMITS
    // All three must be satisfied for the request to proceed:
    // 1. Concurrent requests available
    // 2. Request quota available
    // 3. Token quota available
    return (
      this.activeRequests < this.config.maxConcurrent &&
      requestsInWindow < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
    );
  }

  /**
   * Wait for a concurrent request slot to become available
   *
   * This creates a Promise that resolves when release() is called
   * and there's a queued waiter.
   *
   * Pattern: Queue-based waiting
   * 1. Create a Promise with resolve function
   * 2. Add resolve to waitQueue
   * 3. When release() is called, it dequeues and calls resolve()
   * 4. The await statement unblocks
   *
   * Example flow:
   * ```
   * Request 1: activeRequests = 5 (at max of 5)
   * Request 2: Calls waitForSlot()
   *   → Creates Promise P2 with resolve R2
   *   → Adds R2 to waitQueue: [R2]
   *   → Awaits P2 (blocks here)
   * Request 1: Completes, calls release()
   *   → Dequeues R2 from waitQueue
   *   → Calls R2() → P2 resolves → await unblocks
   * Request 2: Continues executing
   * ```
   */
  private async waitForSlot(): Promise<void> {
    // ★ CREATE A PROMISE THAT RESOLVES WHEN A SLOT OPENS
    return new Promise<void>(resolve => {
      // Add this resolve function to the wait queue
      // When release() is called, it will dequeue this resolve
      // and call it, which will cause this Promise to resolve
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Wait until rate limits allow the request to proceed
   *
   * This implements the sliding window algorithm.
   * If we can't proceed immediately, we calculate how long to wait
   * until the oldest request expires (falls out of the 60-second window).
   *
   * Sliding Window Wait Strategy:
   * - Don't wait a fixed 60 seconds
   * - Wait exactly until the oldest request expires
   * - This minimizes wait time while respecting rate limits
   *
   * Example:
   * ```
   * Current time: 65000ms
   * Oldest request: timestamp 10000ms
   * Expires at: 10000 + 60000 = 70000ms
   * Wait time: 70000 - 65000 = 5000ms
   * → Wait 5 seconds, then oldest expires and new request can proceed
   * ```
   *
   * @param estimatedTokens - Estimated tokens for the request
   */
  private async waitForRateLimit(estimatedTokens: number): Promise<void> {
    // ★ LOOP UNTIL RATE LIMIT ALLOWS PROGRESS
    // Keep waiting until canProceed() returns true
    while (!this.canProceed(estimatedTokens)) {
      // ★ PRUNE OLD RECORDS
      // Remove any requests older than 60 seconds
      this.pruneOldRecords();

      // ★ CHECK IF HISTORY IS EMPTY
      // If no requests in the window, we're ready to go
      // (This can happen if all old requests expired)
      if (this.requestHistory.length === 0) {
        break;
      }

      // ★ CALCULATE WAIT TIME BASED ON OLDEST REQUEST
      // Get the oldest request's timestamp
      const oldestRecord = this.requestHistory[0];
      if (!oldestRecord) {
        // Safety check: if record was pruned, break
        break;
      }
      const oldestTimestamp = oldestRecord.timestamp;

      // Calculate when the oldest request expires
      // Requests expire 60 seconds (60000ms) after they were made
      const expirationTime = oldestTimestamp + 60000;

      // Calculate how long to wait
      let waitTime = expirationTime - Date.now();

      // ★ APPLY WAIT TIME BOUNDS
      // Minimum wait: 100ms (avoid tight loops)
      waitTime = Math.max(100, waitTime);

      // Maximum wait: 5000ms (5 seconds, to avoid hanging too long)
      // If calculated wait exceeds 5 seconds, cap it
      waitTime = Math.min(waitTime, 5000);

      // ★ SLEEP FOR CALCULATED DURATION
      // Use Promise-based delay to allow async/await
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Loop continues and checks canProceed() again
      // If still can't proceed, recalculates and waits again
    }
  }

  /**
   * Remove request records older than 60 seconds (sliding window)
   *
   * This is called before checking rate limits to ensure we only
   * count requests in the current 60-second window.
   *
   * Sliding Window Concept:
   * - Only count requests made in the last 60 seconds
   * - As time passes, old requests "fall off" the window
   * - Provides smooth rate limiting vs. fixed time buckets
   *
   * Example:
   * Request history (timestamps in ms):
   *   [1000, 15000, 25000, 55000, 60500, 60800]
   * Current time: 65000ms
   * Cutoff: 65000 - 60000 = 5000ms
   * After prune: [15000, 25000, 55000, 60500, 60800]
   * (Removed 1000 because it's older than 60 seconds)
   */
  private pruneOldRecords(): void {
    // ★ SLIDING WINDOW CALCULATION
    // Calculate the cutoff time: 60 seconds ago from now
    const cutoffTimestamp = Date.now() - 60000; // 60 seconds in milliseconds

    // ★ FILTER TO KEEP ONLY RECENT RECORDS
    // Keep all requests made after the cutoff (within last 60 seconds)
    // Remove all requests made before the cutoff (older than 60 seconds)
    this.requestHistory = this.requestHistory.filter(
      record => record.timestamp > cutoffTimestamp
    );
  }
}

/**
 * Wrap an async function with rate limiting
 *
 * This is a convenience function for applying rate limiting to any async operation.
 */
export function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens: number = 1000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      await rateLimiter.acquire(estimatedTokens);
      const result = await fn();
      rateLimiter.release();
      resolve(result);
    } catch (error) {
      rateLimiter.release();
      reject(error);
    }
  });
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();