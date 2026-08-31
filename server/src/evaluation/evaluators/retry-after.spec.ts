import { parseRetryAfterMs } from './retry-after';

describe('parseRetryAfterMs', () => {
  it('returns undefined when the header is absent', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
  });

  it('parses a numeric seconds value into milliseconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('parses an HTTP-date value into a positive millisecond delay', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const result = parseRetryAfterMs(future);
    expect(result).toBeGreaterThan(50_000);
    expect(result).toBeLessThanOrEqual(60_000);
  });

  it('clamps a past HTTP-date to 0 rather than a negative delay', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  it('returns undefined for unparsable garbage', () => {
    expect(parseRetryAfterMs('not-a-valid-value-at-all')).toBeUndefined();
  });
});
