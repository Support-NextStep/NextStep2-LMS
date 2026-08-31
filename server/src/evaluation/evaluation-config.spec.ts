import { ConfigService } from '@nestjs/config';
import { EvaluationConfig } from './evaluation-config';

function configWith(overrides: Record<string, string>): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

describe('EvaluationConfig', () => {
  it('falls back to documented defaults when nothing is set', () => {
    const config = new EvaluationConfig(configWith({}));
    expect(config.concurrency).toBe(5);
    expect(config.pollIntervalMs).toBe(2_000);
    expect(config.timeoutMs).toBe(45_000);
    expect(config.maxRetries).toBe(3);
    expect(config.retryBaseDelayMs).toBe(2_000);
    expect(config.retryMaxDelayMs).toBe(30_000);
    expect(config.staleMs).toBe(120_000);
    expect(config.maxFiles).toBe(50);
    expect(config.maxTotalInputChars).toBe(50_000);
  });

  it('reads every value from the environment when set', () => {
    const config = new EvaluationConfig(
      configWith({
        EVALUATION_CONCURRENCY: '10',
        AI_EVALUATION_MAX_RETRIES: '7',
        AI_EVALUATION_MAX_FILES: '3',
      })
    );
    expect(config.concurrency).toBe(10);
    expect(config.maxRetries).toBe(7);
    expect(config.maxFiles).toBe(3);
  });

  it('ignores an invalid (non-numeric or negative) value and falls back to the default', () => {
    const config = new EvaluationConfig(configWith({ EVALUATION_CONCURRENCY: 'not-a-number' }));
    expect(config.concurrency).toBe(5);
    const configNegative = new EvaluationConfig(configWith({ EVALUATION_CONCURRENCY: '-1' }));
    expect(configNegative.concurrency).toBe(5);
  });

  describe('backoffDelayMs', () => {
    it('grows exponentially with retryCount, capped at retryMaxDelayMs', () => {
      const config = new EvaluationConfig(
        configWith({
          AI_EVALUATION_RETRY_BASE_DELAY_MS: '1000',
          AI_EVALUATION_RETRY_MAX_DELAY_MS: '10000',
        })
      );
      // base * 2^(n-1), plus up to 20% jitter — check the un-jittered floor and the cap.
      expect(config.backoffDelayMs(1)).toBeGreaterThanOrEqual(1000);
      expect(config.backoffDelayMs(1)).toBeLessThan(1300);
      expect(config.backoffDelayMs(2)).toBeGreaterThanOrEqual(2000);
      expect(config.backoffDelayMs(2)).toBeLessThan(2600);
      // 1000 * 2^9 = 512000, far past the 10000 cap.
      expect(config.backoffDelayMs(10)).toBe(10000);
    });

    it('never returns a delay below the base for the first retry', () => {
      const config = new EvaluationConfig(configWith({ AI_EVALUATION_RETRY_BASE_DELAY_MS: '2000' }));
      expect(config.backoffDelayMs(1)).toBeGreaterThanOrEqual(2000);
    });
  });
});
