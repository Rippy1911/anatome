// Local-midnight day bucketing.
//
// A meal eaten at 23:30 in Warsaw belongs to that day. Bucketing on UTC instead puts it on
// tomorrow, which silently corrupts every daily total, every streak and every "what did I eat
// today" answer for anyone who is not on UTC — i.e. almost everybody. The sibling platform has
// exactly this bug right now (it has a `timezone` column that no query reads), which is why
// this file exists before any logging code does.
//
// Workers ship full ICU, so `Intl.DateTimeFormat` with a `timeZone` is the whole implementation:
// no tz database to bundle, no DST arithmetic to get wrong.
//
// Note what is NOT local: rate-limit windows. Fair use resets at 00:00 **UTC** for everyone, and
// the docs say so. Mixing the two would let a caller pick a timezone to get a second budget.

export const DEFAULT_TIMEZONE = "UTC";

/** True when the runtime recognises this IANA zone name. */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar date in `tz` at instant `at`, as `YYYY-MM-DD`.
 * Falls back to UTC for an unknown zone rather than throwing — a bad stored timezone should
 * degrade a date by a few hours, not take the account down.
 */
export function localDate(tz: string, at: Date = new Date()): string {
  const zone = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  // en-CA formats as YYYY-MM-DD, which is exactly the storage format.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** `n` days back from today in `tz`, inclusive of today, oldest first. */
export function recentLocalDates(tz: string, days: number, at: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(localDate(tz, new Date(at.getTime() - i * 86_400_000)));
  }
  return out;
}

/** Validate a caller-supplied `YYYY-MM-DD`. Returns null when it is not a real date. */
export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Round-trip guards against 2026-02-31 and friends, which Date happily rolls over.
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    return null;
  }
  return value;
}
