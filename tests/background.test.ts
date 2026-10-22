import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Runtime, Tabs } from 'webextension-polyfill';
import type { State, Book } from '../src/domain/model';
import type { Reply, Command, Heartbeat, ReaderReply } from '../src/shared/messages';
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
async function beat(overrides: Partial<Heartbeat> = {}): Promise<ReaderReply> {
  const heartbeat: Heartbeat = { type: 'HEARTBEAT', detection: { key: 'test-book', supported: true, reason: '합성 테스트' }, visible: true, mono: Date.now(), token: 'document-1', timezone: 'Asia/Seoul', ...overrides };
  return await listener(heartbeat, { id: runtimeId, url: book.url, tab: { id: 1, windowId: 1, active: true, url: book.url, index: 0, highlighted: false, pinned: false, incognito: false } }) as ReaderReply;
}
async function visit(key: string, metadata: Partial<Heartbeat['detection']> = {}, tabId = 1): Promise<ReaderReply> {
  const tab = { id: tabId, windowId: 1, active: true, url: `https://play.google.com/books/reader?id=${key}&pg=9`, index: 0, highlighted: false, pinned: false, incognito: false };
  const observation: Heartbeat = { type: 'HEARTBEAT', detection: { key, supported: true, reason: 'test', ...metadata }, visible: true, mono: Date.now(), token: `page-${key}`, timezone: 'Asia/Seoul' };
  vi.spyOn(fake.tabs, 'get').mockImplementation(async id => ({ ...tab, id, active: id === tabId }) as Tabs.Tab);
  vi.spyOn(fake.tabs, 'query').mockResolvedValue([tab]);
  vi.spyOn(fake.tabs, 'sendMessage').mockImplementation(async () => ({ ...observation, mono: Date.now() }));
  return await listener(observation, { id: runtimeId, url: tab.url, tab }) as ReaderReply;
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); data = undefined; focused = true;
  const alarms = new Map<string, { name: string; scheduledTime: number }>();
  const transient: Record<string, unknown> = {};
  fake = {
    runtime: { id: runtimeId, getURL: (path: string) => origin + path, onMessage: { addListener: (value: Listener) => { listener = value; } },
      onStartup: { addListener: (value: () => void) => { startup = value; } }, onInstalled: basicEvent() },
    storage: { local: { get: async () => ({ [STORAGE_KEY]: data }), set: async (record: Record<string, State>) => { data = structuredClone(record[STORAGE_KEY]); } },
      session: { get: async () => structuredClone(transient), set: async (record: Record<string, unknown>) => Object.assign(transient, structuredClone(record)) } },
    action: { openPopup: vi.fn(async () => undefined) },
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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
    startup(); await state(); expect(spy.mock.calls.some(call => (call[1] as { type: string }).type === 'SCAN_LIBRARY')).toBe(false);
    const reply = await listener({ type: 'SCAN_LIBRARY' }, { id: runtimeId, url: `${origin}popup.html` }) as Reply;
    expect(reply).toEqual({ ok: false, error: '서재 가져오기는 대시보드에서 실행하세요.' }); expect(spy.mock.calls.some(call => (call[1] as { type: string }).type === 'SCAN_LIBRARY')).toBe(false);
  });
  it('확장 대시보드 탭의 메시지를 처리하고 외부 발신자는 거부한다', async () => {
    expect((await state()).books[0].title).toBe('테스트 도서');
    expect(await listener({ type: 'DELETE_BOOK', id: book.id }, { id: 'other', url: 'https://example.com' })).toBeUndefined();
    expect(await listener({ type: 'DELETE_BOOK', id: book.id }, { id: runtimeId, url: book.url, tab: { id: 1, index: 0, highlighted: false, active: true, pinned: false, incognito: false } })).toBeUndefined();
    expect((await state()).books).toHaveLength(1);
  });
  it('두 세션 중복 시작을 막고 보이는 책은 메모 중 포커스가 없어도 측정한다', async () => {
    await send({ type: 'START', id: book.id }); await expect(send({ type: 'START', id: book.id })).rejects.toThrow('진행 중');
    vi.setSystemTime(Date.now() + 5000); await beat(); expect((await state()).active?.buckets[0].seconds).toBe(5);
    focused = false;
    const focusEvent = vi.mocked(fake.windows.onFocusChanged.addListener).mock.calls[0][0];
    focusEvent(-1); await state();
    for (let i = 0; i < 2; i++) { vi.setSystemTime(Date.now() + 5000); await beat(); }
    expect((await state()).active?.status).toBe('running'); expect((await state()).active?.buckets[0].seconds).toBe(15);
    focused = true; vi.setSystemTime(Date.now() + 5000); await beat(); await send({ type: 'STOP' });
    expect((await state()).sessions[0].durationSeconds).toBe(20); expect((await state()).trackingBlocked).toBe(true);
  });
  it('5초 안에 돌아오면 버튼 없이 이어 가고 숨겨진 시간은 제외한다', async () => {
    await send({ type: 'START', id: book.id });
    vi.setSystemTime(Date.now() + 5000); await beat(); await beat({ visible: false });
    expect((await state()).active?.status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(5000); await beat();
    expect((await state()).active?.status).toBe('running');
    vi.setSystemTime(Date.now() + 5000); await beat();
    expect((await state()).active?.buckets[0].seconds).toBe(10);
  });
  it('반복 숨김 관측은 유예를 연장하지 않고 5초 후 페이지 재개 버튼을 제공한다', async () => {
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, readerPrompt: false } });
    await send({ type: 'START', id: book.id });
    const id = (await state()).active!.id;
    await beat({ visible: false }); await vi.advanceTimersByTimeAsync(3000); await beat({ visible: false });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await state()).active).toMatchObject({ id, status: 'paused' });
    expect(await beat()).toMatchObject({ reader: { started: true, paused: true, sessionId: id, showPrompt: false } });
    vi.setSystemTime(Date.now() + 60000); await beat();
    expect((await state()).active?.status).toBe('paused'); expect((await state()).active?.buckets).toEqual([]);
    const sender = { id: runtimeId, url: book.url, tab: await fake.tabs.get(1) };
    expect(await listener({ type: 'READER_RESUME', key: 'test-book', sessionId: crypto.randomUUID() }, sender)).toMatchObject({ ok: false });
    expect((await state()).active?.status).toBe('paused');
    expect(await listener({ type: 'READER_RESUME', key: 'test-book', sessionId: id }, sender)).toMatchObject({ ok: true, reader: { paused: false } });
    vi.setSystemTime(Date.now() + 5000); await beat(); expect((await state()).active?.buckets[0].seconds).toBe(5);
  });
  it('지연된 타이머 콜백에 의존하지 않고 복귀 관측 자체가 유예 만료를 검사한다', async () => {
    await send({ type: 'START', id: book.id }); await beat({ visible: false });
    vi.setSystemTime(Date.now() + 5001); await beat();
    expect((await state()).active?.status).toBe('paused');
  });
  it('이벤트 페이지가 다시 로드되어도 저장된 유예 시작 시각을 유지한다', async () => {
    await send({ type: 'START', id: book.id }); const id = (await state()).active!.id;
    await beat({ visible: false });
    vi.clearAllTimers(); vi.resetModules(); await import('../src/background/index');
    vi.setSystemTime(Date.now() + 5001); await beat();
    expect((await state()).active).toMatchObject({ id, status: 'paused' });
    expect((await state()).active?.buckets).toEqual([]);
  });
  it('페이지가 visible을 보내도 최소화된 창은 집계하지 않는다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat();
    vi.spyOn(fake.windows, 'get').mockResolvedValue({ id: 1, focused: false, state: 'minimized', incognito: false, alwaysOnTop: false });
    await beat(); vi.setSystemTime(Date.now() + 5001); await beat();
    expect((await state()).active?.status).toBe('paused'); expect((await state()).active?.buckets[0].seconds).toBe(5);
    vi.mocked(fake.windows.get).mockResolvedValue({ id: 1, focused: true, state: 'normal', incognito: false, alwaysOnTop: false }); await beat();
    expect((await state()).active?.status).toBe('paused');
  });
  it('새로고침과 서재 왕복에도 같은 세션과 5초 규칙을 적용한다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat();
    const id = (await state()).active!.id;
    const updated = vi.mocked(fake.tabs.onUpdated.addListener).mock.calls[0][0];
    updated(1, { status: 'loading' }, await fake.tabs.get(1)); await state();
    vi.setSystemTime(Date.now() + 2000); await beat({ token: 'refreshed-document' });
    expect((await state()).active).toMatchObject({ id, status: 'running' });
    const url = 'https://play.google.com/books';
    vi.spyOn(fake.tabs, 'get').mockResolvedValue({ id: 1, windowId: 1, active: true, url } as Tabs.Tab);
    await listener({ type: 'HEARTBEAT', detection: { key: null, supported: false, reason: '' }, visible: true, mono: Date.now(), token: 'refreshed-document', timezone: 'Asia/Seoul' }, { id: runtimeId, url: book.url, tab: await fake.tabs.get(1) });
    vi.setSystemTime(Date.now() + 5001);
    vi.mocked(fake.tabs.get).mockResolvedValue({ id: 1, windowId: 1, active: true, url: book.url } as Tabs.Tab);
    await beat({ token: 'refreshed-document' });
    expect((await state()).active).toMatchObject({ id, status: 'paused' });
    expect((await state()).active?.buckets[0].seconds).toBe(5);
  });
  it('다른 창의 보이는 책은 세션을 가져가거나 다른 책으로 종료하지 않는다', async () => {
    await send({ type: 'START', id: book.id }); const id = (await state()).active!.id;
    vi.spyOn(fake.windows, 'get').mockImplementation(async windowId => ({ id: windowId, focused: windowId === 1, state: 'normal' }) as Awaited<ReturnType<typeof fake.windows.get>>);
    const tab = { id: 2, windowId: 2, active: true, url: book.url } as Tabs.Tab;
    vi.spyOn(fake.tabs, 'get').mockImplementation(async tabId => tabId === 2 ? tab : { ...tab, id: 1, windowId: 1 });
    const observation: Heartbeat = { type: 'HEARTBEAT', detection: { key: 'test-book', supported: true, reason: '' }, visible: true, mono: Date.now(), token: 'other-document', timezone: 'Asia/Seoul' };
    await listener(observation, { id: runtimeId, url: tab.url, tab });
    expect((await state()).active).toMatchObject({ id, tabId: 1 });
    tab.url = 'https://play.google.com/books/reader?id=other-book';
    await listener({ ...observation, detection: { ...observation.detection, key: 'other-book' } }, { id: runtimeId, url: tab.url, tab });
    expect((await state()).active).toMatchObject({ id, tabId: 1 }); expect((await state()).books).toHaveLength(1);
    tab.url = book.url;
    vi.mocked(fake.windows.get).mockImplementation(async windowId => ({ id: windowId, focused: windowId === 2, state: 'normal' }) as Awaited<ReturnType<typeof fake.windows.get>>);
    await listener(observation, { id: runtimeId, url: tab.url, tab });
    expect((await state()).active).toMatchObject({ id, tabId: 2, windowId: 2, status: 'running' });
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

describe('책 URL 대조와 버튼으로 시작하는 독서', () => {
  it('현재 URL의 ID로 저장된 책을 선택하고 기존 자동 시작 설정이 켜져 있어도 클릭 전에는 기록하지 않는다', async () => {
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, autoStart: true, currentBookId: null } });
    await visit('test-book', { title: 'Google title', author: 'Google author' });
    vi.setSystemTime(Date.now() + 5000); await visit('test-book');
    const next = await state();
    expect(next.books).toHaveLength(1); expect(next.books[0].title).toBe(book.title); expect(next.books[0].author).toBe('');
    expect(next.settings.currentBookId).toBe(book.id); expect(next.active).toBeNull(); expect(next.sessions).toEqual([]);
    expect(fake.action.openPopup).toHaveBeenCalledTimes(1);
    expect((await send({ type: 'GET_STATE' })).snapshot?.detection?.key).toBe('test-book');
    const revision = next.revision; await state(); await state(); expect((await state()).revision).toBe(revision);
  });
  it('새 책은 한 번만 등록하고 도구 모음 팝업 실패 시 페이지 시작 안내를 반환한다', async () => {
    vi.mocked(fake.action.openPopup).mockRejectedValue(new Error('user gesture required'));
    const result = await visit('new-book', { title: '새로 연 책', author: '저자' });
    expect(result).toMatchObject({ ok: true, reader: { key: 'new-book', title: '새로 연 책', showPrompt: true, started: false } });
    await visit('new-book');
    const next = await state(); expect(next.books).toHaveLength(2); expect(next.active).toBeNull();
    expect(next.books.find(value => value.id === next.settings.currentBookId)?.title).toBe('새로 연 책');
    expect(fake.action.openPopup).toHaveBeenCalledTimes(1);
  });
  it('같은 문서에서 URL이 바뀌어 발신 URL이 서재로 남아도 실제 탭의 책 ID로 감지한다', async () => {
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, readerPrompt: false } });
    await visit('spa-book', { title: 'SPA 도서' });
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, readerPrompt: true } });
    const observation = await fake.tabs.sendMessage(1, { type: 'GET_EVIDENCE' });
    const sender = { id: runtimeId, url: 'https://play.google.com/books', frameId: 0, tab: await fake.tabs.get(1) };
    expect(await listener(observation, sender)).toMatchObject({ reader: { key: 'spa-book', started: false } });
    expect(fake.action.openPopup).toHaveBeenCalledTimes(1);
    expect(await listener({ type: 'READER_START', key: 'spa-book' }, sender)).toEqual({ ok: true });
    expect((await state()).active?.bookId).toBe((await state()).settings.currentBookId);
  });
  it('페이지의 시작 버튼 메시지만 해당 전면 책에 연결하고 시작 이전 시간은 제외한다', async () => {
    await visit('clicked-book', { title: '버튼으로 시작할 책' });
    vi.setSystemTime(Date.now() + 60000);
    expect((await state()).active).toBeNull();
    const sender = { id: runtimeId, url: 'https://play.google.com/books/reader?id=clicked-book', tab: await fake.tabs.get(1) };
    const result = await listener({ type: 'READER_START', key: 'clicked-book' }, sender);
    expect(result).toEqual({ ok: true });
    vi.setSystemTime(Date.now() + 5000); await visit('clicked-book');
    await send({ type: 'STOP' }); const next = await state();
    expect(next.sessions[0].durationSeconds).toBe(5); expect(next.active).toBeNull();
    await visit('clicked-book'); expect(fake.action.openPopup).toHaveBeenCalledTimes(1);
  });
  it('다른 책으로 옮기면 이전 기록만 저장하고 새 책의 버튼 입력을 기다린다', async () => {
    await send({ type: 'START', id: book.id }); vi.setSystemTime(Date.now() + 5000); await beat();
    await visit('second-book', { title: '두 번째 책' }, 2);
    const next = await state(); expect(next.active).toBeNull(); expect(next.sessions[0].bookId).toBe(book.id); expect(next.sessions[0].durationSeconds).toBe(5);
    expect(next.books.find(value => value.id === next.settings.currentBookId)?.title).toBe('두 번째 책');
    await beat(); expect((await state()).settings.currentBookId).toBe(next.settings.currentBookId);
  });
  it('제목이 늦게 확인돼도 같은 ID와 기록을 유지하고 사용자 수정 제목은 보호한다', async () => {
    await visit('late-title'); let next = await state(); const provisional = next.books.find(value => value.id === next.settings.currentBookId)!;
    expect(provisional.pendingTitle).toBe(true);
    await send({ type: 'START', id: provisional.id });
    vi.setSystemTime(Date.now() + 5000); await visit('late-title'); await send({ type: 'STOP' });
    await visit('late-title', { title: '확인한 제목', author: '확인한 저자' }); next = await state();
    expect(next.books).toHaveLength(2); expect(next.books.find(value => value.id === provisional.id)).toMatchObject({ title: '확인한 제목', pendingTitle: false });
    expect(next.sessions[0].bookTitle).toBe('확인한 제목'); expect(next.sessions[0].durationSeconds).toBe(5);
    await send({ type: 'SAVE_BOOK', book: { ...next.books.find(value => value.id === provisional.id)!, title: '내 제목' } });
    await visit('late-title', { title: '다른 Google 제목' });
    expect((await state()).books.find(value => value.id === provisional.id)?.title).toBe('내 제목');
    await visit('manual-title'); next = await state(); const pending = next.books.find(value => value.id === next.settings.currentBookId)!;
    await send({ type: 'SAVE_BOOK', book: { ...pending, title: '내가 먼저 정한 제목', author: '내 저자' } });
    await visit('manual-title', { title: '늦은 제목', author: '늦은 저자' });
    expect((await state()).books.find(value => value.id === pending.id)).toMatchObject({ title: '내가 먼저 정한 제목', author: '내 저자', pendingTitle: false, pendingAuthor: false });
  });
  it('완독·잠시 멈춤·보관 상태는 감지로 바꾸지 않고 명시적으로 재개할 때만 해제한다', async () => {
    await send({ type: 'SAVE_BOOK', book: { ...book, status: 'completed' } }); await send({ type: 'DELETE_BOOK', id: book.id });
    expect(await visit('test-book')).toMatchObject({ reader: { restore: true, started: false } });
    expect((await state()).books[0]).toMatchObject({ status: 'completed', archivedAt: expect.any(String) });
    await expect(send({ type: 'START', id: book.id })).rejects.toThrow('읽기 재개');
    await send({ type: 'START', id: book.id, restore: true });
    const next = await state(); expect(next.books[0].archivedAt).toBeUndefined(); expect(next.books[0].status).toBe('reading'); expect(next.active?.bookId).toBe(book.id);
  });
  it('안내를 닫은 뒤 같은 책을 관측하거나 새로고침해도 다시 띄우지 않는다', async () => {
    vi.mocked(fake.action.openPopup).mockRejectedValue(new Error('blocked'));
    await visit('test-book');
    await listener({ type: 'READER_DISMISS', key: 'test-book' }, { id: runtimeId, url: book.url, tab: await fake.tabs.get(1) });
    expect(await visit('test-book')).toMatchObject({ reader: { showPrompt: false } });
    await visit('test-book'); expect(fake.action.openPopup).toHaveBeenCalledTimes(1);
  });
  it('안내를 꺼도 책 선택은 갱신하며 비전면 탭·서점·일치하지 않는 메시지는 시작하지 않는다', async () => {
    await send({ type: 'SAVE_SETTINGS', settings: { ...(await state()).settings, readerPrompt: false, autoStart: true } });
    await visit('no-prompt', { title: '안내 없이 감지' });
    expect(fake.action.openPopup).not.toHaveBeenCalled(); expect((await state()).active).toBeNull();
    const before = (await state()).books.length;
    const observation: Heartbeat = { type: 'HEARTBEAT', detection: { key: 'forged', supported: true, reason: '' }, visible: true, mono: Date.now(), token: 'test', timezone: 'Asia/Seoul' };
    await listener(observation, { id: runtimeId, url: 'https://play.google.com/books', tab: await fake.tabs.get(1) });
    expect((await state()).books).toHaveLength(before);
    const reply = await listener({ type: 'READER_START', key: 'forged' }, { id: runtimeId, url: 'https://play.google.com/books', tab: await fake.tabs.get(1) });
    expect(reply).toEqual({ ok: false });
    focused = false; expect(await listener({ type: 'READER_START', key: 'no-prompt' }, { id: runtimeId, url: 'https://play.google.com/books/reader?id=no-prompt', tab: await fake.tabs.get(1) })).toMatchObject({ ok: false });
    expect((await state()).active).toBeNull();
  });
});
