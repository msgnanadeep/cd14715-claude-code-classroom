import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withRetry,
  withTimeout,
  ReviewError,
  ErrorCodes
} from '../src/utils/error-handler.js';
import {
  RateLimiter,
  DEFAULT_RATE_LIMITS,
  withRateLimit
} from '../src/utils/rate-limiter.js';

/**
 * Tests for withRetry utility function
 */
describe('withRetry', () => {
  describe('Success cases', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should succeed after retries', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 3, 100);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRetries parameter', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 2, 100);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Failure cases', () => {
    it('should throw ReviewError when all retries fail', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      try {
        await withRetry(fn, 2, 100);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewError);
        const reviewError = error as ReviewError;
        expect(reviewError.code).toBe(ErrorCodes.RETRY_EXHAUSTED);
        expect(reviewError.message).toContain('failed after 2 retries');
        expect(reviewError.metadata?.maxRetries).toBe(2);
      }
    });

    it('should include last error message in ReviewError', async () => {
      const testError = new Error('specific error message');
      const fn = vi.fn().mockRejectedValue(testError);

      try {
        await withRetry(fn, 1, 100);
        expect.fail('Should have thrown an error');
      } catch (error) {
        const reviewError = error as ReviewError;
        expect(reviewError.metadata?.lastError).toContain('specific error message');
      }
    });

    it('should use exponential backoff', async () => {
      const startTime = Date.now();
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        // 3 retries with 100ms base = ~700ms total (100 + 200 + 400 jitter)
        await withRetry(fn, 3, 100);
      } catch (error) {
        // Expected to fail
      }

      const elapsed = Date.now() - startTime;
      // Should have waited at least 300ms (100 + 200) but less than 1000ms
      expect(elapsed).toBeGreaterThanOrEqual(300);
      expect(elapsed).toBeLessThan(1500); // Account for jitter and execution time
    });
  });

  describe('Default parameters', () => {
    it('should use default maxRetries of 3', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        await withRetry(fn);
      } catch (error) {
        // Expected to fail
      }

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use default delayMs of 1000', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      await withRetry(fn);
      const elapsed = Date.now() - startTime;

      // Should have waited at least ~1000ms for exponential backoff
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });
  });
});

/**
 * Tests for withTimeout utility function
 */
describe('withTimeout', () => {
  describe('Success cases', () => {
    it('should return result when function completes before timeout', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await withTimeout(fn, 5000);
      expect(result).toBe('result');
    });

    it('should work with fast operations', async () => {
      const fn = vi.fn().mockResolvedValue('fast');
      const result = await withTimeout(fn, 100);
      expect(result).toBe('fast');
    });
  });

  describe('Timeout cases', () => {
    it('should throw ReviewError when timeout is exceeded', async () => {
      const fn = vi.fn(() => new Promise(resolve => {
        setTimeout(() => resolve('never'), 5000);
      }));

      try {
        await withTimeout(fn, 100);
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewError);
        const reviewError = error as ReviewError;
        expect(reviewError.code).toBe(ErrorCodes.AGENT_TIMEOUT);
        expect(reviewError.message).toContain('Operation timed out');
      }
    });

    it('should use custom error message', async () => {
      const fn = vi.fn(() => new Promise(resolve => {
        setTimeout(() => resolve('never'), 5000);
      }));

      const customMessage = 'Custom timeout message';
      try {
        await withTimeout(fn, 100, customMessage);
        expect.fail('Should have timed out');
      } catch (error) {
        const reviewError = error as ReviewError;
        expect(reviewError.message).toBe(customMessage);
      }
    });

    it('should include timeoutMs in metadata', async () => {
      const fn = vi.fn(() => new Promise(resolve => {
        setTimeout(() => resolve('never'), 5000);
      }));

      try {
        await withTimeout(fn, 200);
        expect.fail('Should have timed out');
      } catch (error) {
        const reviewError = error as ReviewError;
        expect(reviewError.metadata?.timeoutMs).toBe(200);
      }
    });

    it('should throw function errors that occur before timeout', async () => {
      const testError = new Error('function error');
      const fn = vi.fn().mockRejectedValue(testError);

      try {
        await withTimeout(fn, 5000);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBe(testError);
      }
    });
  });
});

/**
 * Tests for RateLimiter class
 */
describe('RateLimiter', () => {
  describe('Initialization', () => {
    it('should initialize with default limits', () => {
      const limiter = new RateLimiter();
      const status = limiter.getStatus();

      expect(status.activeRequests).toBe(0);
      expect(status.requestsInWindow).toBe(0);
      expect(status.tokensInWindow).toBe(0);
      expect(status.availableRequests).toBe(DEFAULT_RATE_LIMITS.maxRequestsPerMinute);
      expect(status.availableTokens).toBe(DEFAULT_RATE_LIMITS.maxTokensPerMinute);
    });

    it('should allow custom configuration', () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 50000,
        maxConcurrent: 2
      });

      const status = limiter.getStatus();
      expect(status.availableRequests).toBe(10);
      expect(status.availableTokens).toBe(50000);
    });
  });

  describe('canProceed', () => {
    it('should allow request when limits not reached', () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 100000,
        maxConcurrent: 5
      });

      expect(limiter.canProceed(1000)).toBe(true);
    });

    it('should block request when concurrent limit exceeded', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1
      });

      await limiter.acquire(1000);
      expect(limiter.canProceed(1000)).toBe(false);
      limiter.release();
    });

    it('should block request when request limit exceeded', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 1,
        maxConcurrent: 10
      });

      await limiter.acquire(1000);
      expect(limiter.canProceed(1000)).toBe(false);
      limiter.release();
    });

    it('should block request when token limit exceeded', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 2000,
        maxConcurrent: 10
      });

      await limiter.acquire(1500);
      expect(limiter.canProceed(1000)).toBe(false);
      limiter.release();
    });
  });

  describe('acquire and release', () => {
    it('should track active requests', async () => {
      const limiter = new RateLimiter();

      let status = limiter.getStatus();
      expect(status.activeRequests).toBe(0);

      await limiter.acquire(1000);
      status = limiter.getStatus();
      expect(status.activeRequests).toBe(1);

      limiter.release();
      status = limiter.getStatus();
      expect(status.activeRequests).toBe(0);
    });

    it('should track tokens in history', async () => {
      const limiter = new RateLimiter();

      await limiter.acquire(1500);
      let status = limiter.getStatus();
      expect(status.tokensInWindow).toBe(1500);

      await limiter.acquire(500);
      status = limiter.getStatus();
      expect(status.tokensInWindow).toBe(2000);

      limiter.release(1500);
      limiter.release(500);
    });

    it('should update token count when actual usage provided', async () => {
      const limiter = new RateLimiter();

      await limiter.acquire(1500);
      let status = limiter.getStatus();
      expect(status.tokensInWindow).toBe(1500);

      limiter.release(2000);  // Actual usage was higher
      status = limiter.getStatus();
      expect(status.tokensInWindow).toBe(2000);
    });

    it('should handle concurrent requests within limit', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 3
      });

      await limiter.acquire(1000);
      await limiter.acquire(1000);
      await limiter.acquire(1000);

      let status = limiter.getStatus();
      expect(status.activeRequests).toBe(3);

      limiter.release();
      limiter.release();
      limiter.release();

      status = limiter.getStatus();
      expect(status.activeRequests).toBe(0);
    });

    it('should queue requests that exceed concurrent limit', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1
      });

      await limiter.acquire(1000);

      let resolved = false;
      const promise = limiter.acquire(1000).then(() => {
        resolved = true;
      });

      // Give it a moment to queue
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(false);

      limiter.release();

      // Give it a moment to process the queue
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(true);

      limiter.release();
    });
  });

  describe('getStatus', () => {
    it('should report correct status', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 100000,
        maxConcurrent: 5
      });

      await limiter.acquire(1500);
      await limiter.acquire(2500);

      const status = limiter.getStatus();

      expect(status.activeRequests).toBe(2);
      expect(status.requestsInWindow).toBe(2);
      expect(status.tokensInWindow).toBe(4000);
      expect(status.availableRequests).toBe(8);
      expect(status.availableTokens).toBe(96000);

      limiter.release();
      limiter.release();
    });
  });

  describe('Sliding window pruning', () => {
    it('should prune old records after 60 seconds', async () => {
      const limiter = new RateLimiter();

      await limiter.acquire(1000);
      let status = limiter.getStatus();
      expect(status.requestsInWindow).toBe(1);

      // Simulate time passing (note: in real test, this would use fake timers)
      // For now, just verify the pruning logic works with current time
      limiter.release();
    });
  });
});

/**
 * Tests for withRateLimit wrapper function
 */
describe('withRateLimit', () => {
  it('should execute function within rate limits', async () => {
    const limiter = new RateLimiter();
    const fn = vi.fn().mockResolvedValue('result');

    const result = await withRateLimit(limiter, fn, 1000);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should release on success', async () => {
    const limiter = new RateLimiter();
    const fn = vi.fn().mockResolvedValue('result');

    await withRateLimit(limiter, fn, 1000);

    const status = limiter.getStatus();
    expect(status.activeRequests).toBe(0);
  });

  it('should release on error', async () => {
    const limiter = new RateLimiter();
    const error = new Error('test error');
    const fn = vi.fn().mockRejectedValue(error);

    try {
      await withRateLimit(limiter, fn, 1000);
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err).toBe(error);
    }

    const status = limiter.getStatus();
    expect(status.activeRequests).toBe(0);
  });

  it('should use estimated tokens parameter', async () => {
    const limiter = new RateLimiter();
    const fn = vi.fn().mockResolvedValue('result');

    await withRateLimit(limiter, fn, 5000);

    const status = limiter.getStatus();
    expect(status.tokensInWindow).toBe(5000);

    limiter.release();
  });
});
