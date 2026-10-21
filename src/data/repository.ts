import { emptyState, stateSchema, type State, type Book, type Session, type Settings } from '../domain/model';
import { canonicalBookUrl } from '../domain/books';
import { localDate } from '../domain/time';

export const STORAGE_KEY = 'readchime.state';
export interface StorageAdapter { get(): Promise<unknown>; set(state: State): Promise<void> }
export interface BookRepository { listBooks(): Promise<Book[]> }
export interface ReadingSessionRepository { listSessions(): Promise<Session[]> }
export interface SettingsRepository { getSettings(): Promise<Settings> }

export function validateState(raw: unknown): State {
  const state = stateSchema.parse(raw);
  if (new Set(state.books.map(b => b.id)).size !== state.books.length || new Set(state.sessions.map(s => s.id)).size !== state.sessions.length) throw new Error('중복된 기록 ID가 있습니다.');
  const ids = new Set(state.books.map(b => b.id));
  for (const book of state.books) if (book.url) canonicalBookUrl(book.url);
  for (const session of state.sessions) {
    if (!ids.has(session.bookId)) throw new Error('독서 기록에 연결된 책을 찾을 수 없습니다.');
    try { new Intl.DateTimeFormat('ko', { timeZone: session.timezone }); } catch { throw new Error('기록에 알 수 없는 시간대가 포함되어 있습니다.'); }
  }
  if (state.settings.currentBookId && !ids.has(state.settings.currentBookId)) throw new Error('현재 책이 서재에 없습니다.');
  if (state.active && !ids.has(state.active.bookId)) throw new Error('진행 중인 독서에 연결된 책을 찾을 수 없습니다.');
  return state;
}

export function migrate(raw: unknown): State {
  if (!raw || typeof raw !== 'object') throw new Error('저장된 데이터의 형식이 올바르지 않습니다. 원본은 보존했습니다.');
  if (!('schemaVersion' in raw)) throw new Error('저장된 데이터에 버전 정보가 없습니다.');
  if (raw.schemaVersion === 2) return validateState(raw);
  if (raw.schemaVersion !== 1) throw new Error('지원하지 않는 버전의 데이터입니다. 확장을 업데이트하세요.');
  const old = raw as Record<string, unknown>;
  const base = emptyState();
  const books = old.books as Book[];
  if (!Array.isArray(books) || !Array.isArray(old.sessions)) throw new Error('이전 버전 데이터가 손상되었습니다.');
  return validateState({ ...base, ...old, schemaVersion: 2, active: null,
    settings: { ...base.settings, ...(old.settings as object) },
    goals: [{ from: '1970-01-01', minutes: (old.settings as Settings)?.goalMinutes ?? 5 }],
    sessions: (old.sessions as Session[]).map(s => ({ ...s,
      bookTitle: books.find(b => b.id === s.bookId)?.title ?? '삭제된 책',
      localDate: localDate(new Date(s.startedAt), 'UTC'), timezone: 'UTC',
      measurement: s.source === 'automatic' ? 'timer' : 'entry', corrected: false, interrupted: false,
    })),
  });
}

// A single root key is committed only after validation. Only the background owns this repository.
export class LocalRepository implements BookRepository, ReadingSessionRepository, SettingsRepository {
  private cached: State | undefined;
  private loading: Promise<State> | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly adapter: StorageAdapter) {}
  async read(): Promise<State> {
    if (this.cached) return structuredClone(this.cached);
    if (!this.loading) this.loading = (async () => {
      const raw = await this.adapter.get();
      const value = raw === undefined ? emptyState() : migrate(raw);
      if (raw === undefined || (raw as State).schemaVersion !== 2) await this.adapter.set(value);
      this.cached = value; return value;
    })();
    return structuredClone(await this.loading);
  }
  update(mutator: (draft: State) => void): Promise<State> {
    const operation = this.tail.then(async () => {
      const draft = await this.read(); mutator(draft); draft.revision++;
      const checked = validateState(draft); await this.adapter.set(checked); this.cached = checked;
      return structuredClone(checked);
    });
    this.tail = operation.catch(() => undefined); return operation;
  }
  async listBooks() { return (await this.read()).books; }
  async listSessions() { return (await this.read()).sessions; }
  async getSettings() { return (await this.read()).settings; }
}
