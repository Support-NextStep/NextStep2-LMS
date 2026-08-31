/** `Retry-After` is either a number of seconds or an HTTP-date — both are legal per RFC 9110. Returns milliseconds, or undefined if absent/unparsable. Shared by every evaluator implementation that talks to an HTTP provider capable of returning this header on a 429. */
export function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}
