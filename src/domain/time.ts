export function localDate(instant: Date | number = Date.now(), timezone = currentTimezone()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function currentTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
export function shiftDate(key: string, days: number): string {
  const value = new Date(`${key}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
export function weekStart(key: string): string {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay(); return shiftDate(key, -(weekday + 6) % 7);
}
// Binary search the first new local date; this handles DST without assuming 24-hour days.
export function nextDateBoundary(start: number, end: number, timezone: string): number {
  const day = localDate(start, timezone);
  if (localDate(end, timezone) === day) return end;
  let low = start, high = end;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (localDate(mid, timezone) === day) low = mid; else high = mid;
  }
  return high;
}
export function minuteText(seconds: number, language: 'ko' | 'en' = 'ko'): string { return (seconds / 60).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 1 }); }
export function clockText(seconds: number): string {
  const sec = Math.floor(seconds); return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
}
