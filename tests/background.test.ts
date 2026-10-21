import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Runtime } from 'webextension-polyfill';
import type { State, Book } from '../src/domain/model';
import type { Reply, Command, Heartbeat } from '../src/shared/messages';
import { STORAGE_KEY } from '../src/data/repository';

type Listener = (message: unknown, sender: Runtime.MessageSender) => unknown;
let listener: Listener;
let data: State | undefined;
let focused: boolean;
let startup: () => void;
let book: Book;
let fake: typeof browser;
const origin = 'moz-extension://readchime-test/';
const runtimeId = 'readchime@local.invalid';
const basicEvent = () => ({ addListener: vi.fn(), removeListener: vi.fn() });

async function send(command: Command) {
  const result = await listener(command, { id: runtimeId, url: `${origin}dashboard.html`, tab: { id: 99, windowId: 1, index: 0, highlighted: false, active: true, pinned: false, incognito: false } }) as Reply;
  if (!result?.ok) throw new Error(result && !result.ok ? result.error : '응답 없음');
  return result;
}
async function state() { return (await send({ type: 'GET_STATE' })).snapshot!.state; }
async function beat() {
  const heartbeat: Heartbeat = { type: 'HEARTBEAT', detection: { key: 'test-book', supported: true, reason: '합성 테스트' }, visible: true, mono: Date.now(), token: 'document-1', timezone: 'Asia/Seoul' };
  await listener(heartbeat, { id: runtimeId, url: book.url, tab: { id: 1, windowId: 1, active: true, url: book.url, index: 0, highlighted: false, pinned: false, incognito: false } });
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); data = undefined; focused = true;
  const alarms = new Map<string, { name: string; scheduledTime: number }>();
  fake = {
    runtime: { id: runtimeId, getURL: (path: string) => origin + path, onMessage: { addListener: (value: Listener) => { listener = value; } },
      onStartup: { addListener: (value: () => void) => { startup = value; } }, onInstalled: basicEvent() },
    storage: { local: { get: async () => ({ [STORAGE_KEY]: data }), set: async (record: Record<string, State>) => { data = structuredClone(record[STORAGE_KEY]); } } },
    alarms: { get: async (name: string) => alarms.get(name), create: (name: string, info: { when?: number }) => { alarms.set(name, { name, scheduledTime: info.when ?? Date.now() + 60000 }); }, clear: async (name: string) => alarms.delete(name), onAlarm: basicEvent() },
    tabs: { get: async () => ({ id: 1, windowId: 1, active: true, url: book?.url }), query: async () => [{ id: 1, windowId: 1, active: true, url: book?.url }],
      update: async () => ({ id: 1, windowId: 1, active: true, url: book?.url }), create: vi.fn(async () => ({ id: 1, windowId: 1 })),
      sendMessage: async () => ({ type: 'HEARTBEAT', detection: { key: 'test-book', supported: true, reason: '' }, visible: true, mono: Date.now(), token: 'document-1', timezone: 'Asia/Seoul' }),
      onActivated: basicEvent(), onUpdated: basicEvent(), onRemoved: basicEvent() },
    windows: { get: async () => ({ id: 1, focused, state: 'normal' }), update: async () => undefined, onFocusChanged: basicEvent() },
    notifications: { create: vi.fn(async () => 'test'), clear: vi.fn(async () => true), onClicked: basicEvent() },
  } as unknown as typeof browser;
  vi.stubGlobal('browser', fake); await import('../src/background/index');
  const now = new Date().toISOString();
  book = { id: crypto.randomUUID(), title: '테스트 도서', author: '', url: 'https://play.google.com/books/reader?id=test-book', status: 'reading', notes: '', createdAt: now, updatedAt: now };
  await send({ type: 'SAVE_BOOK', book });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('실제 백그라운드 배선과 저장소 통합', () => {
  it('uses the saved language for notifications while preserving book titles and protocol errors', async () => {
    const original = structuredClone(book);
    for (const language of ['en', 'ko'] as const) {
      await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, language, reminderMode: 'gentle' } });
      await send({ type: 'TEST_REMINDER' });
      expect(fake.notifications.create).toHaveBeenLastCalledWith('readchime.prompt', expect.objectContaining({
        title: language === 'en' ? 'Time for a few pages?' : '오늘도 잠깐 책을 펼쳐 볼까요?',
        message: expect.stringContaining(original.title),
      }));
      expect(fake.notifications.create).toHaveBeenLastCalledWith('readchime.prompt', expect.objectContaining({
        message: expect.stringContaining(language === 'en' ? "Today's goal: 5 min" : '오늘 목표 5분'),
      }));
    }
    expect((await state()).books[0]).toEqual(original);
    Object.defineProperty(fake, 'i18n', { value: { getUILanguage: () => 'en-US' } });
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, language: 'system' } });
    await send({ type: 'TEST_REMINDER' });
    expect(fake.notifications.create).toHaveBeenLastCalledWith('readchime.prompt', expect.objectContaining({ title: 'Time for a few pages?' }));
  });
  it('서재 감지는 팝업·다른 확장 페이지에서 실행하지 못하고 시작 이벤트도 감지하지 않는다', async () => {
    const spy = vi.spyOn(fake.tabs, 'sendMessage');
    startup(); await state(); expect(spy).not.toHaveBeenCalled();
    const reply = await listener({ type: 'SCAN_LIBRARY' }, { id: runtimeId, url: `${origin}popup.html` }) as Reply;
    expect(reply).toEqual({ ok: false, error: '서재 가져오기는 대시보드에서 실행하세요.' }); expect(spy).not.toHaveBeenCalled();
  });
  it('확장 대시보드 탭의 메시지를 처리하고 외부 발신자는 거부한다', async () => {
    expect((await state()).books[0].title).toBe('테스트 도서');
    expect(await listener({ type: 'DELETE_BOOK', id: book.id }, { id: 'other', url: 'https://example.com' })).toBeUndefined();
    expect(await listener({ type: 'DELETE_BOOK', id: book.id }, { id: runtimeId, url: book.url, tab: { id: 1, index: 0, highlighted: false, active: true, pinned: false, incognito: false } })).toBeUndefined();
    expect((await state()).books).toHaveLength(1);
  });
  it('두 세션 중복 시작을 막고 포커스가 없는 시간을 제외한다', async () => {
    await send({ type: 'START', id: book.id }); await expect(send({ type: 'START', id: book.id })).rejects.toThrow('진행 중');
    vi.setSystemTime(Date.now() + 5000); await beat(); expect((await state()).active?.buckets[0].seconds).toBe(5);
    focused = false; vi.setSystemTime(Date.now() + 5000); await beat(); vi.setSystemTime(Date.now() + 60000); await beat();
    expect((await state()).active?.status).toBe('waiting'); expect((await state()).active?.buckets[0].seconds).toBe(5);
    focused = true; await beat(); vi.setSystemTime(Date.now() + 5000); await beat(); await send({ type: 'STOP' });
    expect((await state()).sessions[0].durationSeconds).toBe(10); expect((await state()).trackingBlocked).toBe(true);
  });
  it('명시적 일시정지 후에는 관측만으로 재개되지 않는다', async () => {
    await send({ type: 'START', id: book.id }); await send({ type: 'PAUSE' }); vi.setSystemTime(Date.now() + 5000); await beat();
    expect((await state()).active?.status).toBe('paused'); await send({ type: 'RESUME' }); await beat(); vi.setSystemTime(Date.now() + 5000); await beat(); expect((await state()).active?.buckets[0].seconds).toBe(5);
  });
  it('브라우저 시작 이벤트는 확인된 시간만 남기고 자동 재시작을 막는다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat(); startup(); const next = await state();
    expect(next.active).toBeNull(); expect(next.sessions[0].durationSeconds).toBe(5); expect(next.sessions[0].interrupted).toBe(true); expect(next.trackingBlocked).toBe(true);
  });
  it('길게 끊긴 관측은 절전 구간을 더하지 않는다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat(); vi.setSystemTime(Date.now() + 600000); await beat();
    const next = await state(); expect(next.active).toBeNull(); expect(next.sessions[0].durationSeconds).toBe(5);
  });
  it('서재 삭제가 과거 기록과 제목을 없애지 않는다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat(); await send({ type: 'STOP' }); await send({ type: 'DELETE_BOOK', id: book.id });
    const next = await state(); expect(next.books[0].archivedAt).toBeTruthy(); expect(next.sessions[0].bookTitle).toBe('테스트 도서');
  });
  it('전체 교체는 미리보기 뒤 변경된 데이터와 확인 없는 요청을 거부한다', async () => {
    const json = (await send({ type: 'EXPORT' })).json!; const revision = (await state()).revision;
    await send({ type: 'SELECT_BOOK', id: book.id });
    await expect(send({ type: 'IMPORT', json, mode: 'replace', useImportedIds: [], includeSettings: true, confirmed: true, expectedRevision: revision })).rejects.toThrow('변경');
    await expect(send({ type: 'IMPORT', json, mode: 'replace', useImportedIds: [], includeSettings: true, confirmed: false, expectedRevision: (await state()).revision })).rejects.toThrow('확인');
  });
  it('수동 기록과 추정 타이머가 같은 합계에 들어간다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat(); await send({ type: 'STOP' }); const auto = (await state()).sessions[0];
    await send({ type: 'SAVE_SESSION', session: { ...auto, id: crypto.randomUUID(), durationSeconds: 295, source: 'manual', measurement: 'entry', device: 'tablet' } });
    expect((await state()).sessions.reduce((sum, value) => sum + value.durationSeconds, 0)).toBe(300);
  });
  it('영구 삭제는 제거된 책과 별도 확인이 필요하다', async () => {
    await expect(send({ type: 'PURGE_BOOK', id: book.id, confirmed: true })).rejects.toThrow('별도 확인');
    await send({ type: 'DELETE_BOOK', id: book.id });
    await expect(send({ type: 'PURGE_BOOK', id: book.id, confirmed: false })).rejects.toThrow('별도 확인');
    await send({ type: 'PURGE_BOOK', id: book.id, confirmed: true }); expect((await state()).books).toHaveLength(0);
  });
});
