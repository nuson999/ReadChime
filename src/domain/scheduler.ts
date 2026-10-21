import type { Settings, State } from './model';
import { localDate } from './time';
import { summary } from './statistics';

export const DAILY_ALARM = 'readchime.daily';
export const SNOOZE_ALARM = 'readchime.snooze';
export const RECONCILE_ALARM = 'readchime.reconcile';
export function scheduledToday(now: Date, settings: Pick<Settings, 'hour' | 'minute'>): Date {
  const date = new Date(now); date.setHours(settings.hour, settings.minute, 0, 0); return date;
}
export function nextAlarm(now: Date, settings: Pick<Settings, 'hour' | 'minute'>): number {
  const next = scheduledToday(now, settings);
  if (next.valueOf() <= now.valueOf()) { next.setDate(next.getDate() + 1); next.setHours(settings.hour, settings.minute, 0, 0); }
  return next.valueOf();
}
export function shouldPrompt(state: State, now: Date, snoozed = false): boolean {
  const day = localDate(now); const reading = summary(state, day);
  if (!state.settings.reminderEnabled || state.reminder.skipped.includes(day) || reading.todaySeconds >= reading.goal * 60 || state.active?.status === 'running') return false;
  if (snoozed) return !!state.reminder.snooze && state.reminder.snooze.day === day && state.reminder.snooze.at <= now.valueOf();
  const scheduled = scheduledToday(now, state.settings).valueOf();
  return !state.reminder.days.includes(day) && now.valueOf() >= scheduled && now.valueOf() - scheduled <= state.settings.graceMinutes * 60000;
}
export function snoozeAt(now: Date, minutes: number): { day: string; at: number } | null {
  const at = now.valueOf() + minutes * 60000; return localDate(at) === localDate(now) ? { day: localDate(now), at } : null;
}
