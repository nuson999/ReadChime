import type { State, Session } from './model';
import { localDate, shiftDate, weekStart } from './time';

export function goalFor(state: Pick<State, 'goals'>, day: string): number {
  return [...state.goals].sort((a, b) => a.from.localeCompare(b.from)).filter(g => g.from <= day).at(-1)?.minutes ?? 5;
}
export function allReadings(state: State): Session[] {
  const active = state.active;
  if (!active) return state.sessions;
  return [...state.sessions, ...active.buckets.filter(b => b.seconds >= 1).map((b): Session => ({
    id: active.id, groupId: active.id, bookId: active.bookId, bookTitle: active.bookTitle,
    startedAt: b.startedAt, endedAt: b.endedAt, durationSeconds: Math.floor(b.seconds), localDate: b.localDate,
    timezone: b.timezone, source: 'automatic', measurement: 'timer', device: 'desktop', notes: '',
    createdAt: active.startedAt, updatedAt: b.endedAt, corrected: false, interrupted: false,
  }))];
}
export function dailySeries(state: State, count: number, today = localDate()) {
  const sums = new Map<string, number>();
  for (const s of allReadings(state)) sums.set(s.localDate, (sums.get(s.localDate) ?? 0) + s.durationSeconds);
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(today, i - count + 1); const seconds = sums.get(date) ?? 0; const goal = goalFor(state, date);
    return { date, label: date.slice(5).replace('-', '/'), seconds, minutes: Math.round(seconds / 6) / 10, goal, complete: seconds >= goal * 60 };
  });
}
export function summary(state: State, today = localDate()) {
  const readings = allReadings(state); const todaySeconds = readings.filter(s => s.localDate === today).reduce((v, s) => v + s.durationSeconds, 0);
  const week = weekStart(today), month = today.slice(0, 7);
  return { todaySeconds, goal: goalFor(state, today),
    weekSeconds: readings.filter(s => s.localDate >= week && s.localDate <= today).reduce((v, s) => v + s.durationSeconds, 0),
    monthSeconds: readings.filter(s => s.localDate.startsWith(month) && s.localDate <= today).reduce((v, s) => v + s.durationSeconds, 0) };
}
