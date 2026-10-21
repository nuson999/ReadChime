import { z } from 'zod';

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, '올바른 날짜를 입력하세요.');
const instant = z.iso.datetime().transform(value => new Date(value).toISOString());
const id = z.uuid();
const note = z.string().max(4000).default('');
export const bookSchema = z.object({
  id, title: z.string().trim().min(1).max(300), author: z.string().max(200).default(''),
  url: z.string().max(2048).default(''), status: z.enum(['planned', 'reading', 'completed', 'paused']),
  notes: note, createdAt: instant, updatedAt: instant, lastReadAt: instant.optional(), archivedAt: instant.optional(),
});
export const settingsSchema = z.object({
  language: z.enum(['system', 'ko', 'en']).default('system'),
  reminderEnabled: z.boolean().default(true), hour: z.number().int().min(0).max(23).default(22),
  minute: z.number().int().min(0).max(59).default(0), goalMinutes: z.number().int().min(1).max(1440).default(5),
  reminderMode: z.enum(['direct', 'gentle']).default('direct'),
  snoozeMinutes: z.number().int().min(1).max(120).default(10),
  graceMinutes: z.number().int().min(0).max(720).default(120), autoStart: z.boolean().default(false),
  theme: z.enum(['system', 'light', 'dark']).default('system'), currentBookId: id.nullable().default(null),
});
export const sessionSchema = z.object({
  id, bookId: id, bookTitle: z.string().min(1).max(300), startedAt: instant, endedAt: instant,
  durationSeconds: z.number().int().min(1).max(86400),
  source: z.enum(['automatic', 'manual']), measurement: z.enum(['timer', 'entry']),
  device: z.enum(['desktop', 'tablet', 'smartphone', 'paper', 'other']), notes: note,
  localDate: dateKeySchema, timezone: z.string().max(100),
  createdAt: instant, updatedAt: instant, interrupted: z.boolean().default(false),
  corrected: z.boolean().default(false), groupId: id.optional(),
}).refine(s => Date.parse(s.endedAt) >= Date.parse(s.startedAt), '종료 시각이 시작 시각보다 빠릅니다.');
export const bucketSchema = z.object({
  localDate: dateKeySchema, timezone: z.string(), seconds: z.number().min(0), startedAt: instant, endedAt: instant,
});
export const activeSchema = z.object({
  id, bookId: id, bookTitle: z.string(), startedAt: instant, tabId: z.number().int(), windowId: z.number().int(),
  status: z.enum(['running', 'waiting', 'paused']), manualConfirmed: z.boolean(), automaticStart: z.boolean(),
  buckets: z.array(bucketSchema),
  evidence: z.object({ at: z.number(), mono: z.number(), token: z.string(), eligible: z.boolean(), timezone: z.string() }).nullable(),
});
export const reminderSchema = z.object({
  days: z.array(dateKeySchema).max(1000).default([]), skipped: z.array(dateKeySchema).max(1000).default([]),
  snooze: z.object({ day: dateKeySchema, at: z.number() }).nullable().default(null),
  lastError: z.string().default(''),
});
export const stateSchema = z.object({
  schemaVersion: z.literal(2), revision: z.number().int().min(0), createdAt: instant,
  settings: settingsSchema, books: z.array(bookSchema).max(20000), sessions: z.array(sessionSchema).max(200000),
  goals: z.array(z.object({ from: dateKeySchema, minutes: z.number().int().min(1).max(1440) })).min(1),
  active: activeSchema.nullable(), reminder: reminderSchema,
  trackingBlocked: z.boolean().default(false),
});
export type Book = z.infer<typeof bookSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ActiveSession = z.infer<typeof activeSchema>;
export type Bucket = z.infer<typeof bucketSchema>;
export type State = z.infer<typeof stateSchema>;

export function emptyState(now = new Date()): State {
  return { schemaVersion: 2, revision: 0, createdAt: now.toISOString(), settings: settingsSchema.parse({}),
    books: [], sessions: [], goals: [{ from: '1970-01-01', minutes: 5 }], active: null,
    reminder: reminderSchema.parse({}), trackingBlocked: false };
}
