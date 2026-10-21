import { z } from 'zod';
import { stateSchema, emptyState, type State, type Book, type Session } from '../domain/model';
import { migrate, validateState } from './repository';

const backupSchema = stateSchema.pick({ schemaVersion: true, createdAt: true, settings: true, books: true, sessions: true, goals: true }).extend({
  format: z.literal('ReadChime'), exportedAt: z.iso.datetime(),
});
export function exportBackup(state: State): string {
  return JSON.stringify({ format: 'ReadChime', exportedAt: new Date().toISOString(), schemaVersion: 2,
    createdAt: state.createdAt, settings: state.settings, books: state.books, sessions: state.sessions, goals: state.goals }, null, 2);
}
export function parseBackup(json: string): State {
  if (json.length > 25 * 1024 * 1024) throw new Error('25MB 이하인 백업만 가져올 수 있습니다.');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion === 1) return migrate(raw);
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error('ReadChime 백업의 형식이나 값이 올바르지 않습니다. 원본은 변경하지 않았습니다.');
  return validateState({ ...emptyState(), ...parsed.data, active: null });
}
export function previewMerge(current: State, imported: State) {
  const conflicts: { kind: 'book' | 'session'; id: string; label: string }[] = [];
  let addedBooks = 0, addedSessions = 0, identical = 0;
  const inspect = (old: Book[] | Session[], next: Book[] | Session[], kind: 'book' | 'session') => {
    for (const value of next) {
      const previous = old.find(v => v.id === value.id);
      if (!previous) { if (kind === 'book') addedBooks++; else addedSessions++; }
      else if (JSON.stringify(previous, Object.keys(previous).sort()) === JSON.stringify(value, Object.keys(value).sort())) identical++;
      else conflicts.push({ kind, id: value.id, label: 'title' in value ? value.title : `${value.localDate} · ${value.bookTitle}` });
    }
  };
  inspect(current.books, imported.books, 'book'); inspect(current.sessions, imported.sessions, 'session');
  return { addedBooks, addedSessions, identical, conflicts };
}
export function mergeBackup(current: State, imported: State, useImportedIds: string[], includeSettings: boolean): State {
  const next = structuredClone(current); const selected = new Set(useImportedIds);
  function merge<T extends { id: string }>(old: T[], incoming: T[]): T[] {
    const values = new Map(old.map(v => [v.id, v]));
    for (const value of incoming) if (!values.has(value.id) || selected.has(value.id)) values.set(value.id, value);
    return [...values.values()];
  }
  next.books = merge(current.books, imported.books); next.sessions = merge(current.sessions, imported.sessions);
  if (includeSettings) { next.settings = imported.settings; next.goals = imported.goals; }
  return validateState(next);
}
