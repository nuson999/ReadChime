import { z } from 'zod';
import { bookSchema, sessionSchema, settingsSchema, dateKeySchema, type State } from '../domain/model';
import type { Detection } from '../domain/detector';
import { libraryKeySchema, MAX_LIBRARY_BOOKS, type LibraryApplied, type LibraryFlow } from '../domain/library';

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_STATE') }),
  z.object({ type: z.literal('SCAN_LIBRARY'), tabId: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('FOCUS_LIBRARY_TAB'), tabId: z.number().int().min(0) }),
  z.object({ type: z.literal('APPLY_LIBRARY'), scanId: z.uuid(), keys: z.array(libraryKeySchema).min(1).max(MAX_LIBRARY_BOOKS) }),
  z.object({ type: z.literal('SAVE_BOOK'), book: bookSchema }),
  z.object({ type: z.literal('DELETE_BOOK'), id: z.uuid() }),
  z.object({ type: z.literal('PURGE_BOOK'), id: z.uuid(), confirmed: z.boolean() }),
  z.object({ type: z.literal('SELECT_BOOK'), id: z.uuid() }),
  z.object({ type: z.literal('SAVE_SETTINGS'), settings: settingsSchema }),
  z.object({ type: z.literal('OPEN_BOOK'), id: z.uuid().optional() }),
  z.object({ type: z.literal('START'), id: z.uuid(), confirm: z.boolean().default(false) }),
  z.object({ type: z.literal('PAUSE') }), z.object({ type: z.literal('RESUME') }), z.object({ type: z.literal('STOP') }),
  z.object({ type: z.literal('SAVE_SESSION'), session: sessionSchema }),
  z.object({ type: z.literal('DELETE_SESSION'), id: z.uuid() }),
  z.object({ type: z.literal('SKIP') }), z.object({ type: z.literal('SNOOZE') }),
  z.object({ type: z.literal('TEST_REMINDER') }),
  z.object({ type: z.literal('EXPORT') }),
  z.object({ type: z.literal('PREVIEW_IMPORT'), json: z.string() }),
  z.object({ type: z.literal('IMPORT'), json: z.string(), mode: z.enum(['merge', 'replace']), useImportedIds: z.array(z.uuid()), includeSettings: z.boolean(), confirmed: z.boolean(), expectedRevision: z.number().int() }),
  z.object({ type: z.literal('DASHBOARD'), section: z.enum(['home', 'stats', 'library', 'history', 'settings']).optional() }),
]);
export type Command = z.input<typeof commandSchema>;
export interface Heartbeat { type: 'HEARTBEAT'; detection: Detection; visible: boolean; mono: number; token: string; timezone: string }
export const heartbeatSchema = z.object({
  type: z.literal('HEARTBEAT'), detection: z.object({ key: z.string().nullable(), supported: z.boolean(), reason: z.string() }),
  visible: z.boolean(), mono: z.number().finite(), token: z.string().max(100), timezone: z.string().max(100),
});
export interface Snapshot { state: State; nextAlarm: number | null; detection?: Detection; error?: string }
export interface ImportPreview { addedBooks: number; addedSessions: number; identical: number; conflicts: { kind: 'book' | 'session'; id: string; label: string }[] }
export type Reply = { ok: true; snapshot?: Snapshot; json?: string; preview?: ImportPreview; library?: LibraryFlow; libraryApplied?: LibraryApplied } | { ok: false; error: string };
export const manualInputSchema = z.object({ date: dateKeySchema, minutes: z.number().positive().max(1440) });
