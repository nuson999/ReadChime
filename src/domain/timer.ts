import type { ActiveSession, Bucket, Session } from './model';
import { localDate, nextDateBoundary } from './time';

export const MAX_EVIDENCE_GAP_MS = 12000;
export const READING_GRACE_MS = 5000;
export const MAX_CLOCK_DRIFT_MS = 2000;
export interface Evidence { at: number; mono: number; token: string; eligible: boolean; timezone: string }
export type StopReason = NonNullable<ActiveSession['lastStopReason']>['reason'];

function addInterval(buckets: Bucket[], from: number, to: number, timezone: string): void {
  let cursor = from;
  while (cursor < to) {
    const end = nextDateBoundary(cursor, to, timezone); const day = localDate(cursor, timezone);
    let bucket = buckets.find(b => b.localDate === day && b.timezone === timezone);
    if (!bucket) { bucket = { localDate: day, timezone, seconds: 0, startedAt: new Date(cursor).toISOString(), endedAt: new Date(end).toISOString() }; buckets.push(bucket); }
    bucket.seconds += (end - cursor) / 1000; bucket.endedAt = new Date(end).toISOString(); cursor = end;
  }
}
// Only pairs of timely visible observations establish a countable interval. A late or
// inconsistent observation drops the uncounted gap and becomes the next baseline;
// it never ends the session.
export function observe(active: ActiveSession, evidence: Evidence): StopReason | undefined {
  expireAway(active, evidence.at);
  const previous = active.evidence; let gap: StopReason | undefined;
  if (previous) {
    const elapsed = evidence.at - previous.at; const monotonic = evidence.mono - previous.mono;
    if (active.status !== 'paused' && previous.eligible) {
      if (elapsed < 0 || elapsed > MAX_EVIDENCE_GAP_MS) gap = 'gap';
      else if (previous.token === evidence.token && Math.abs(elapsed - monotonic) > MAX_CLOCK_DRIFT_MS) gap = 'drift';
      else if (previous.timezone !== evidence.timezone) gap = 'timezone';
    }
    if (gap) stopped(active, gap, evidence.at);
    else if (active.status !== 'paused' && previous.eligible && evidence.eligible && previous.token === evidence.token && monotonic > 0) {
      addInterval(active.buckets, previous.at, evidence.at, evidence.timezone);
    }
  }
  active.evidence = evidence;
  if (active.status !== 'paused') {
    if (evidence.eligible) { active.status = 'running'; delete active.awaySince; }
    else leave(active, evidence.at);
  }
  return gap;
}
export function stopped(active: ActiveSession, reason: StopReason, at: number): void {
  active.lastStopReason = { reason, at };
}
export function suspend(active: ActiveSession, explicit = false): void {
  active.status = explicit ? 'paused' : active.status === 'paused' ? 'paused' : 'waiting'; active.evidence = null;
  if (explicit) delete active.awaySince;
}
export function leave(active: ActiveSession, at: number, reason: StopReason = 'hidden'): void {
  if (active.status === 'paused') return;
  if (active.awaySince === undefined) { active.awaySince = at; stopped(active, reason, at); }
  suspend(active);
  expireAway(active, at);
}
export function expireAway(active: ActiveSession, at: number): void {
  if (active.awaySince !== undefined && (at - active.awaySince > READING_GRACE_MS || at < active.awaySince)) { suspend(active, true); stopped(active, 'grace-expired', at); }
}
export function resume(active: ActiveSession): void {
  delete active.awaySince;
  active.status = 'waiting'; active.evidence = null;
}
export function finish(active: ActiveSession, now: string, interrupted: boolean): Session[] {
  return active.buckets.filter(b => Math.floor(b.seconds) > 0).map((b, index) => ({
    id: index === 0 ? active.id : crypto.randomUUID(), groupId: active.id, bookId: active.bookId, bookTitle: active.bookTitle,
    startedAt: b.startedAt, endedAt: b.endedAt, durationSeconds: Math.floor(b.seconds), localDate: b.localDate, timezone: b.timezone,
    source: 'automatic', measurement: 'timer', device: 'desktop', notes: interrupted ? '중단 전 확인된 구간만 저장했습니다.' : '',
    createdAt: active.startedAt, updatedAt: now, corrected: false, interrupted,
  }));
}
