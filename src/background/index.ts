import type { Tabs, Runtime } from 'webextension-polyfill';
import { LocalRepository, STORAGE_KEY } from '../data/repository';
import { exportBackup, parseBackup, mergeBackup, previewMerge } from '../data/backup';
import { bookSchema, sessionSchema, settingsSchema, type State, type Book } from '../domain/model';
import { PLAY_BOOKS, readerKey, canonicalBookUrl, recommend } from '../domain/books';
import { localDate } from '../domain/time';
import { goalFor, summary } from '../domain/statistics';
import { DAILY_ALARM, SNOOZE_ALARM, RECONCILE_ALARM, nextAlarm, scheduledToday, shouldPrompt, snoozeAt } from '../domain/scheduler';
import { finish, MAX_EVIDENCE_GAP_MS, observe, suspend } from '../domain/timer';
import { commandSchema, heartbeatSchema, type Command, type Reply, type Heartbeat, type Snapshot } from '../shared/messages';
import type { Detection } from '../domain/detector';
import { LibraryImporter } from './library';
import { resolveLanguage, translate } from '../i18n';

const repository = new LocalRepository({
  async get() { return (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]; },
  async set(state) { await browser.storage.local.set({ [STORAGE_KEY]: state }); },
});
const libraryImporter = new LibraryImporter(repository);
let tail: Promise<unknown> = Promise.resolve();
const detections = new Map<number, Detection>();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = tail.then(operation); tail = next.catch(() => undefined); return next;
}
function finalize(state: State, interrupted: boolean) {
  if (!state.active) return;
  state.trackingBlocked = true;
  const sessions = finish(state.active, new Date().toISOString(), interrupted);
  state.sessions.push(...sessions);
  const book = state.books.find(b => b.id === state.active?.bookId);
  if (book && sessions.length) { book.lastReadAt = sessions.at(-1)!.endedAt; book.updatedAt = new Date().toISOString(); }
  state.active = null;
}
function updateLastReads(state: State) {
  for (const book of state.books) book.lastReadAt = state.sessions.filter(s => s.bookId === book.id).sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0]?.endedAt;
}
const ready = repository.read().then(async state => {
  if (state.active) await repository.update(draft => {
    const old = draft.active!;
    if (old.status === 'running' && (!old.evidence || Date.now() - old.evidence.at > MAX_EVIDENCE_GAP_MS)) finalize(draft, true);
    else suspend(old);
  });
});

async function dashboard(section = 'home') {
  const url = browser.runtime.getURL(`dashboard.html#${section}`);
  const existing = (await browser.tabs.query({})).find(t => t.url?.split('#')[0] === url.split('#')[0]);
  if (existing?.id !== undefined) { await browser.tabs.update(existing.id, { url, active: true }); await focusWindow(existing.windowId); }
  else await browser.tabs.create({ url });
}
async function focusWindow(id: number | undefined) {
  if (id === undefined) return;
  const window = await browser.windows.get(id);
  await browser.windows.update(id, { focused: true, ...(window.state === 'minimized' ? { state: 'normal' as const } : {}) });
}
async function openBook(book?: Book): Promise<Tabs.Tab | undefined> {
  if (!book?.url) { await dashboard('library'); return undefined; }
  const key = readerKey(book.url);
  const existing = (await browser.tabs.query({ url: `${PLAY_BOOKS}*` })).find(t => readerKey(t.url ?? '') === key);
  if (existing?.id !== undefined) { const tab = await browser.tabs.update(existing.id, { active: true }); await focusWindow(tab.windowId); return tab; }
  return browser.tabs.create({ url: canonicalBookUrl(book.url) });
}
async function evidenceFor(tabId: number): Promise<Heartbeat | undefined> {
  try { const parsed = heartbeatSchema.safeParse(await browser.tabs.sendMessage(tabId, { type: 'GET_EVIDENCE' })); return parsed.success ? parsed.data : undefined; }
  catch { return undefined; }
}
async function eligible(tabId: number, windowId: number | undefined): Promise<boolean> {
  if (windowId === undefined) return false;
  try { const [tab, window] = await Promise.all([browser.tabs.get(tabId), browser.windows.get(windowId)]); return !!tab.active && !!window.focused && window.state !== 'minimized'; }
  catch { return false; }
}
async function snapshot(): Promise<Snapshot> {
  const [state, alarm, tabs] = await Promise.all([repository.read(), browser.alarms.get(DAILY_ALARM), browser.tabs.query({ active: true, lastFocusedWindow: true })]);
  return { state, nextAlarm: alarm?.scheduledTime ?? null, detection: tabs[0]?.id !== undefined ? detections.get(tabs[0].id) : undefined };
}
async function reconcile() {
  const state = await repository.read(); const now = new Date();
  const alarm = await browser.alarms.get(DAILY_ALARM); const expected = nextAlarm(now, state.settings);
  if (state.settings.reminderEnabled) {
    if (!alarm || Math.abs(alarm.scheduledTime - expected) > 1000) browser.alarms.create(DAILY_ALARM, { when: expected });
  } else await browser.alarms.clear(DAILY_ALARM);
  const snooze = state.reminder.snooze;
  if (snooze && snooze.day === localDate(now) && snooze.at > now.valueOf() && state.settings.reminderEnabled) browser.alarms.create(SNOOZE_ALARM, { when: snooze.at });
  else if (!snooze || snooze.day !== localDate(now) || !state.settings.reminderEnabled) await browser.alarms.clear(SNOOZE_ALARM);
  if (!await browser.alarms.get(RECONCILE_ALARM)) browser.alarms.create(RECONCILE_ALARM, { periodInMinutes: 1 });
}
async function deliver(state: State) {
  const book = recommend(state);
  const locale = resolveLanguage(state.settings.language);
  const t = (message: string, values?: readonly (string | number)[]) => translate(message, values, locale);
  if (state.settings.reminderMode === 'direct') await openBook(book);
  else await browser.notifications.create('readchime.prompt', { type: 'basic', title: t('오늘도 잠깐 책을 펼쳐 볼까요?'),
    message: book ? t('{0} · 오늘 목표 {1}분. 알림을 누르면 책이 열립니다.', [book.title, goalFor(state, localDate())]) : t('읽을 책을 골라 보세요. 확장 팝업에서 다시 알림을 예약하거나 오늘 알림을 건너뛸 수 있습니다.'),
    iconUrl: browser.runtime.getURL('icons/book.svg') });
}
async function checkPrompt() {
  const state = await repository.read(); const now = new Date(); const day = localDate(now);
  const snoozed = !!state.reminder.snooze && state.reminder.snooze.day === day && state.reminder.snooze.at <= now.valueOf();
  const prompt = shouldPrompt(state, now, snoozed);
  const due = state.settings.reminderEnabled && now.valueOf() >= scheduledToday(now, state.settings).valueOf();
  const totals = summary(state, day);
  if (prompt || snoozed || (due && !state.reminder.days.includes(day) && (totals.todaySeconds >= totals.goal * 60 || state.active?.status === 'running'))) {
    const committed = await repository.update(draft => {
      if (!draft.reminder.days.includes(day)) draft.reminder.days = [...draft.reminder.days, day].slice(-900);
      draft.reminder.snooze = null; draft.reminder.lastError = '';
    });
    if (prompt) try { await deliver(committed); } catch { await repository.update(draft => { draft.reminder.lastError = '알림을 표시하지 못했습니다. 설정에서 알림 권한을 확인하거나 ‘독서 시작’을 눌러 주세요.'; }); }
  }
}
async function staleSession() {
  const state = await repository.read();
  if (state.active?.status === 'running' && (!state.active.evidence || Date.now() - state.active.evidence.at > MAX_EVIDENCE_GAP_MS)) await repository.update(draft => finalize(draft, true));
}
async function start(id: string, confirm: boolean, automaticStart = false, observedTab?: Tabs.Tab) {
  const state = await repository.read();
  if (state.active) throw new Error('진행 중인 독서를 먼저 종료하세요. 타이머 두 개를 동시에 실행할 수 없습니다.');
  const book = state.books.find(b => b.id === id && !b.archivedAt);
  if (!book?.url) throw new Error('책의 Play Books 리더 주소를 등록하세요. 다른 기기로 읽은 시간은 수동으로 기록할 수 있습니다.');
  const tab = observedTab ?? await openBook(book);
  if (tab?.id === undefined || tab.windowId === undefined) throw new Error('독서 탭을 열지 못했습니다.');
  let evidence = await evidenceFor(tab.id);
  for (let attempt = 0; !evidence && attempt < 12; attempt++) { await new Promise(resolve => setTimeout(resolve, 250)); evidence = await evidenceFor(tab.id); }
  if (!evidence || evidence.detection.key !== readerKey(book.url)) throw new Error('책을 열었습니다. 책을 모두 불러왔는지, Play Books 접근 권한이 있는지 확인한 뒤 다시 시작하세요. 이미 열려 있던 페이지는 새로고침이 필요할 수 있습니다.');
  if (!evidence.detection.supported && !confirm) throw new Error('리더 구조를 확인하지 못했습니다. 화면에서 ‘이 탭에서 실제로 읽고 있습니다’를 선택한 뒤 다시 시작하세요.');
  const foreground = evidence.visible && await eligible(tab.id, tab.windowId);
  await repository.update(draft => {
    if (draft.active) throw new Error('이미 독서가 진행 중입니다.');
    draft.trackingBlocked = false;
    draft.active = { id: crypto.randomUUID(), bookId: book.id, bookTitle: book.title, startedAt: new Date().toISOString(), tabId: tab.id!, windowId: tab.windowId!,
      status: foreground ? 'running' : 'waiting', manualConfirmed: confirm, automaticStart, buckets: [],
      evidence: { at: Date.now(), mono: evidence!.mono, token: evidence!.token, timezone: evidence!.timezone, eligible: foreground } };
  });
}
async function heartbeat(message: Heartbeat, sender: Runtime.MessageSender) {
  const tab = sender.tab;
  if (tab?.id === undefined || readerKey(sender.url ?? tab.url ?? '') !== message.detection.key || !message.detection.key) return;
  detections.set(tab.id, message.detection);
  const state = await repository.read();
  const foreground = message.visible && await eligible(tab.id, tab.windowId);
  if (!state.active) {
    if (state.settings.autoStart && message.detection.supported && foreground) {
      const book = state.books.find(b => !b.archivedAt && b.status !== 'completed' && b.status !== 'paused' && readerKey(b.url) === message.detection.key);
      if (book && !state.trackingBlocked) await start(book.id, false, true, tab);
    }
    return;
  }
  if (state.active.tabId !== tab.id) return;
  const book = state.books.find(b => b.id === state.active!.bookId);
  if (!book || message.detection.key !== readerKey(book.url)) { await repository.update(draft => { if (draft.active) suspend(draft.active); }); return; }
  await repository.update(draft => {
    if (!draft.active) return;
    const result = observe(draft.active, { at: Date.now(), mono: message.mono, token: message.token, timezone: message.timezone,
      eligible: foreground && (message.detection.supported || draft.active.manualConfirmed) });
    if (result === 'interrupted') finalize(draft, true);
  });
}
async function handle(input: Command): Promise<Reply> {
  await ready;
  const command = commandSchema.parse(input); const now = new Date().toISOString();
  await staleSession();
  switch (command.type) {
    case 'GET_STATE': break;
    case 'SCAN_LIBRARY': return { ok: true, library: await libraryImporter.scan(command.tabId) };
    case 'FOCUS_LIBRARY_TAB': await libraryImporter.focus(command.tabId); break;
    case 'APPLY_LIBRARY': {
      const libraryApplied = await libraryImporter.apply(command.scanId, command.keys);
      return { ok: true, libraryApplied, snapshot: await snapshot() };
    }
    case 'SAVE_BOOK': await repository.update(draft => {
      const book = bookSchema.parse(command.book); if (book.url) book.url = canonicalBookUrl(book.url);
      const existing = draft.books.find(b => b.id === book.id);
      if (existing) Object.assign(existing, book, { createdAt: existing.createdAt, updatedAt: now });
      else draft.books.push({ ...book, createdAt: now, updatedAt: now });
    }); break;
    case 'DELETE_BOOK': await repository.update(draft => {
      if (draft.active?.bookId === command.id) throw new Error('이 책의 독서를 먼저 종료하세요.');
      const book = draft.books.find(b => b.id === command.id); if (book) { book.archivedAt = now; book.updatedAt = now; }
      if (draft.settings.currentBookId === command.id) draft.settings.currentBookId = null;
    }); break;
    case 'PURGE_BOOK': await repository.update(draft => {
      const book = draft.books.find(b => b.id === command.id);
      if (!command.confirmed || !book?.archivedAt) throw new Error('서재에서 제거한 책만 별도 확인을 거쳐 영구 삭제할 수 있습니다.');
      if (draft.active?.bookId === command.id) throw new Error('진행 중인 독서를 먼저 종료하세요.');
      draft.sessions = draft.sessions.filter(s => s.bookId !== command.id); draft.books = draft.books.filter(b => b.id !== command.id);
      if (draft.settings.currentBookId === command.id) draft.settings.currentBookId = null;
    }); break;
    case 'SELECT_BOOK': await repository.update(draft => {
      const book = draft.books.find(b => b.id === command.id && !b.archivedAt);
      if (!book) throw new Error('책을 찾을 수 없습니다.');
      draft.settings.currentBookId = book.id; book.status = 'reading'; book.updatedAt = now;
    }); break;
    case 'SAVE_SETTINGS': await repository.update(draft => {
      const next = settingsSchema.parse(command.settings);
      if (next.goalMinutes !== draft.settings.goalMinutes) {
        const day = localDate(); draft.goals = draft.goals.filter(g => g.from !== day); draft.goals.push({ from: day, minutes: next.goalMinutes });
      }
      if (next.autoStart && !draft.settings.autoStart) draft.trackingBlocked = false;
      draft.settings = next;
    }); break;
    case 'OPEN_BOOK': { const state = await repository.read(); await openBook(command.id ? state.books.find(b => b.id === command.id && !b.archivedAt) : recommend(state)); break; }
    case 'START': await start(command.id, command.confirm); break;
    case 'PAUSE': await repository.update(draft => { if (draft.active) suspend(draft.active, true); }); break;
    case 'RESUME': await repository.update(draft => { if (draft.active) { draft.active.status = 'waiting'; draft.active.evidence = null; } }); break;
    case 'STOP': await repository.update(draft => finalize(draft, false)); break;
    case 'SAVE_SESSION': await repository.update(draft => {
      const session = sessionSchema.parse(command.session);
      if (!draft.books.some(b => b.id === session.bookId)) throw new Error('책을 선택하세요.');
      if (session.localDate > localDate()) throw new Error('미래 날짜에는 완료된 독서를 기록할 수 없습니다.');
      const previous = draft.sessions.find(s => s.id === session.id);
      if (previous) Object.assign(previous, session, { createdAt: previous.createdAt, updatedAt: now, corrected: previous.measurement === 'timer' || previous.corrected });
      else draft.sessions.push({ ...session, source: 'manual', measurement: 'entry', createdAt: now, updatedAt: now });
      const book = draft.books.find(b => b.id === session.bookId)!;
      updateLastReads(draft);
      book.updatedAt = now;
    }); break;
    case 'DELETE_SESSION': await repository.update(draft => {
      draft.sessions = draft.sessions.filter(s => s.id !== command.id);
      updateLastReads(draft);
    }); break;
    case 'SKIP': await repository.update(draft => { draft.reminder.skipped = [...new Set([...draft.reminder.skipped, localDate()])].slice(-900); draft.reminder.snooze = null; }); await browser.notifications.clear('readchime.prompt'); break;
    case 'SNOOZE': await repository.update(draft => {
      if (!draft.settings.reminderEnabled) throw new Error('설정에서 알림을 먼저 켜 주세요.');
      const snooze = snoozeAt(new Date(), draft.settings.snoozeMinutes);
      if (!snooze) throw new Error('다시 알림은 오늘 자정 전까지만 예약합니다.');
      draft.reminder.snooze = snooze; draft.reminder.skipped = draft.reminder.skipped.filter(d => d !== localDate());
      draft.reminder.days = [...new Set([...draft.reminder.days, localDate()])].slice(-900);
    }); await browser.notifications.clear('readchime.prompt'); break;
    case 'TEST_REMINDER': await deliver(await repository.read()); break;
    case 'EXPORT': return { ok: true, json: exportBackup(await repository.read()) };
    case 'PREVIEW_IMPORT': return { ok: true, preview: previewMerge(await repository.read(), parseBackup(command.json)), snapshot: await snapshot() };
    case 'IMPORT': {
      if (!command.confirmed) throw new Error('가져오기 내용을 먼저 확인하세요.');
      const imported = parseBackup(command.json);
      await repository.update(draft => {
        if (draft.active) throw new Error('독서를 종료한 뒤 백업을 가져오세요.');
        if (draft.revision !== command.expectedRevision) throw new Error('미리보기를 연 뒤 데이터가 변경됐습니다. 파일을 다시 선택해 확인하세요.');
        const next = command.mode === 'replace' ? imported : mergeBackup(draft, imported, command.useImportedIds, command.includeSettings);
        Object.assign(draft, next, { revision: draft.revision, active: null });
      }); break;
    }
    case 'DASHBOARD': await dashboard(command.section); break;
  }
  await reconcile();
  if (command.type === 'SAVE_SETTINGS') await checkPrompt();
  return { ok: true, snapshot: await snapshot() };
}
function report(error: unknown) { console.error('ReadChime:', error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'); }
function event(operation: () => Promise<void>) { void serial(async () => { await ready; await operation(); }).catch(report); }

// Register every event synchronously so Firefox can wake the non-persistent event page.
browser.runtime.onMessage.addListener((raw: unknown, sender: Runtime.MessageSender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  const heartbeatInput = heartbeatSchema.safeParse(raw);
  if (heartbeatInput.success && sender.tab) return serial(async () => { await ready; await heartbeat(heartbeatInput.data, sender); return { ok: true }; }).catch(error => { report(error); return { ok: false }; });
  if (!sender.url?.startsWith(browser.runtime.getURL(''))) return undefined;
  return serial(async (): Promise<Reply> => {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: '요청에 올바르지 않은 값이 있습니다. 입력 내용을 확인하세요.' };
    if (['SCAN_LIBRARY', 'FOCUS_LIBRARY_TAB', 'APPLY_LIBRARY'].includes(parsed.data.type) && sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL('dashboard.html')) return { ok: false, error: '서재 가져오기는 대시보드에서 실행하세요.' };
    try { return await handle(parsed.data); }
    catch (error) {
      const message = error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도하세요.';
      const libraryCommand = ['SCAN_LIBRARY', 'FOCUS_LIBRARY_TAB', 'APPLY_LIBRARY'].includes(parsed.data.type);
      return { ok: false, error: libraryCommand && !/[가-힣]/.test(message) ? '서재 작업을 마치지 못했습니다. 접근 권한·탭 상태·저장 공간을 확인한 뒤 다시 감지하세요.' : message };
    }
  });
});
browser.alarms.onAlarm.addListener(alarm => event(async () => {
  if ([DAILY_ALARM, SNOOZE_ALARM, RECONCILE_ALARM].includes(alarm.name)) { await staleSession(); await checkPrompt(); await reconcile(); }
}));
browser.runtime.onStartup.addListener(() => event(async () => {
  await repository.update(draft => finalize(draft, true)); await checkPrompt(); await reconcile();
}));
browser.runtime.onInstalled.addListener(() => event(async () => {
  await repository.update(draft => finalize(draft, true)); await checkPrompt(); await reconcile();
}));
browser.notifications.onClicked.addListener(id => { if (id === 'readchime.prompt') event(async () => { await openBook(recommend(await repository.read())); await browser.notifications.clear(id); }); });
browser.tabs.onActivated.addListener(() => event(async () => { await staleSession(); if ((await repository.read()).active) await repository.update(draft => { if (draft.active) suspend(draft.active); }); await reconcile(); }));
browser.windows.onFocusChanged.addListener(() => event(async () => { await staleSession(); if ((await repository.read()).active) await repository.update(draft => { if (draft.active) suspend(draft.active); }); await reconcile(); }));
browser.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'loading') event(async () => {
  detections.delete(id); if ((await repository.read()).active?.tabId === id) await repository.update(draft => { if (draft.active) { draft.active.manualConfirmed = false; suspend(draft.active); } });
}); });
browser.tabs.onRemoved.addListener(id => event(async () => { detections.delete(id); if ((await repository.read()).active?.tabId === id) await repository.update(draft => finalize(draft, true)); }));
event(reconcile);
