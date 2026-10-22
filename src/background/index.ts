import type { Tabs, Runtime } from 'webextension-polyfill';
import { LocalRepository, STORAGE_KEY } from '../data/repository';
import { exportBackup, parseBackup, mergeBackup, previewMerge } from '../data/backup';
import { bookSchema, sessionSchema, settingsSchema, type State, type Book } from '../domain/model';
import { PLAY_BOOKS, readerKey, canonicalBookUrl, recommend, detectedBook } from '../domain/books';
import { localDate } from '../domain/time';
import { goalFor, summary } from '../domain/statistics';
import { DAILY_ALARM, SNOOZE_ALARM, RECONCILE_ALARM, nextAlarm, scheduledToday, shouldPrompt, snoozeAt } from '../domain/scheduler';
import { expireAway, finish, leave, MAX_EVIDENCE_GAP_MS, observe, READING_GRACE_MS, resume, suspend } from '../domain/timer';
import { commandSchema, heartbeatSchema, readerActionSchema, type Command, type Reply, type Heartbeat, type Snapshot, type ReaderReply } from '../shared/messages';
import type { Detection } from '../domain/detector';
import { LibraryImporter } from './library';
import { resolveLanguage, translate } from '../i18n';
import { ReaderPrompts } from './reader-prompts';

const repository = new LocalRepository({
  async get() { return (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]; },
  async set(state) { await browser.storage.local.set({ [STORAGE_KEY]: state }); },
});
const libraryImporter = new LibraryImporter(repository);
const readerPrompts = new ReaderPrompts();
let tail: Promise<unknown> = Promise.resolve();
const detections = new Map<number, Detection>();
const READING_GRACE_ALARM = 'readchime.reading-grace';
let graceTimer: ReturnType<typeof setTimeout> | undefined;
let graceDeadline: number | undefined;
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
async function eligible(tabId: number, windowId: number | undefined, requireFocus = true): Promise<boolean> {
  if (windowId === undefined) return false;
  try { const [tab, window] = await Promise.all([browser.tabs.get(tabId), browser.windows.get(windowId)]); return !!tab.active && (!requireFocus || !!window.focused) && window.state !== 'minimized'; }
  catch { return false; }
}
async function currentReaderTab(sender: Runtime.MessageSender, key: string | null): Promise<Tabs.Tab | undefined> {
  if (sender.tab?.id === undefined || !key) return undefined;
  try {
    // Firefox keeps sender.url at the document's original URL after history API
    // navigation. Validate its origin, then compare the current tab's reader ID.
    const source = new URL(sender.url ?? sender.tab.url ?? '');
    if (source.origin !== new URL(PLAY_BOOKS).origin || !source.pathname.startsWith('/books')) return undefined;
    const tab = await browser.tabs.get(sender.tab.id);
    return readerKey(tab.url ?? '') === key ? tab : undefined;
  } catch { return undefined; }
}
async function snapshot(): Promise<Snapshot> {
  await syncGrace();
  const [alarm, tabs] = await Promise.all([browser.alarms.get(DAILY_ALARM), browser.tabs.query({ active: true, lastFocusedWindow: true })]);
  const tab = tabs[0];
  // Refresh on popup open as well as heartbeat: an event page may have just woken.
  if (tab?.id !== undefined && readerKey(tab.url ?? '')) {
    const evidence = await evidenceFor(tab.id);
    if (evidence) await heartbeat(evidence, { tab, url: tab.url }, false);
  }
  const detection = tab?.id !== undefined ? detections.get(tab.id) : undefined;
  return { state: await repository.read(), nextAlarm: alarm?.scheduledTime ?? null,
    detection: detection?.key === readerKey(tab?.url ?? '') ? detection : undefined };
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
  await syncGrace();
  const state = await repository.read();
  if (state.active?.status === 'running' && (!state.active.evidence || Date.now() - state.active.evidence.at > MAX_EVIDENCE_GAP_MS)) await repository.update(draft => finalize(draft, true));
}
// Persist the deadline for event-page suspension; a short timer keeps the page UI
// timely while the alarm and all incoming observations also enforce the deadline.
async function syncGrace() {
  let active = (await repository.read()).active;
  if (active?.awaySince !== undefined && (Date.now() > active.awaySince + READING_GRACE_MS || Date.now() < active.awaySince)) {
    await repository.update(draft => { if (draft.active) expireAway(draft.active, Date.now()); });
    active = (await repository.read()).active;
  }
  const deadline = active?.awaySince === undefined ? undefined : active.awaySince + READING_GRACE_MS + 1;
  if (deadline === graceDeadline && (deadline === undefined || graceTimer !== undefined)) return;
  if (graceTimer !== undefined) clearTimeout(graceTimer);
  graceTimer = undefined; graceDeadline = deadline;
  if (deadline === undefined) { await browser.alarms.clear(READING_GRACE_ALARM); return; }
  browser.alarms.create(READING_GRACE_ALARM, { when: deadline });
  graceTimer = setTimeout(() => {
    graceTimer = undefined;
    event(async () => { await syncGrace(); await refreshActiveReader(); });
  }, Math.max(0, deadline - Date.now()));
}
async function markAway() {
  await repository.update(draft => { if (draft.active) leave(draft.active, Date.now()); });
  await syncGrace();
}
async function refreshActiveReader() {
  const state = await repository.read(); const active = state.active;
  if (!active) return;
  let tab: Tabs.Tab;
  try { tab = await browser.tabs.get(active.tabId); } catch { return; }
  const key = readerKey(state.books.find(book => book.id === active.bookId)?.url ?? '');
  if (!key || readerKey(tab.url ?? '') !== key || tab.status === 'loading') { await markAway(); return; }
  const evidence = await evidenceFor(active.tabId);
  if (!evidence || evidence.detection.key !== key) { await markAway(); return; }
  const reply = await heartbeat(evidence, { tab, url: tab.url });
  try { await browser.tabs.sendMessage(active.tabId, { type: 'READER_STATE', reply }); } catch { /* A navigating page will request its own state. */ }
}
async function start(id: string, confirm: boolean, restore = false, observedTab?: Tabs.Tab) {
  const state = await repository.read();
  if (state.active) throw new Error('진행 중인 독서를 먼저 종료하세요. 타이머 두 개를 동시에 실행할 수 없습니다.');
  const book = state.books.find(b => b.id === id);
  if (!book?.url) throw new Error('책의 Play Books 리더 주소를 등록하세요. 다른 기기로 읽은 시간은 수동으로 기록할 수 있습니다.');
  if ((book.archivedAt || book.status === 'completed' || book.status === 'paused') && !restore) throw new Error('책을 다시 읽으려면 읽기 재개를 선택하세요.');
  const selected = (await browser.tabs.query({ active: true, lastFocusedWindow: true })).find(tab => readerKey(tab.url ?? '') === readerKey(book.url));
  const tab = observedTab ?? selected ?? await openBook(book);
  if (tab?.id === undefined || tab.windowId === undefined) throw new Error('독서 탭을 열지 못했습니다.');
  let evidence = await evidenceFor(tab.id);
  for (let attempt = 0; !evidence && attempt < 12; attempt++) { await new Promise(resolve => setTimeout(resolve, 250)); evidence = await evidenceFor(tab.id); }
  if (!evidence || evidence.detection.key !== readerKey(book.url)) throw new Error('책을 열었습니다. 책을 모두 불러왔는지, Play Books 접근 권한이 있는지 확인한 뒤 다시 시작하세요. 이미 열려 있던 페이지는 새로고침이 필요할 수 있습니다.');
  if (!evidence.detection.supported && !confirm) throw new Error('리더 구조를 확인하지 못했습니다. 화면에서 ‘이 탭에서 실제로 읽고 있습니다’를 선택한 뒤 다시 시작하세요.');
  const foreground = evidence.visible && await eligible(tab.id, tab.windowId);
  await repository.update(draft => {
    if (draft.active) throw new Error('이미 독서가 진행 중입니다.');
    draft.trackingBlocked = false;
    const current = draft.books.find(value => value.id === id)!;
    delete current.archivedAt; current.status = 'reading'; current.updatedAt = new Date().toISOString();
    draft.settings.currentBookId = id;
    draft.active = { id: crypto.randomUUID(), bookId: book.id, bookTitle: book.title, startedAt: new Date().toISOString(), tabId: tab.id!, windowId: tab.windowId!,
      status: foreground ? 'running' : 'waiting', manualConfirmed: confirm, automaticStart: false, buckets: [],
      evidence: { at: Date.now(), mono: evidence!.mono, token: evidence!.token, timezone: evidence!.timezone, eligible: foreground } };
  });
  await readerPrompts.dismiss(tab.id, readerKey(book.url)!);
}
async function heartbeat(message: Heartbeat, sender: Runtime.MessageSender, prompt = true): Promise<ReaderReply> {
  const tab = await currentReaderTab(sender, message.detection.key);
  if (tab?.id === undefined || !message.detection.key) {
    // SPA navigation to the library still comes from the connected reader's
    // content script. A stale mismatching reader ID cannot change its session.
    if (prompt && message.detection.key === null && sender.tab?.id === (await repository.read()).active?.tabId) {
      try {
        const source = new URL(sender.url ?? ''); const current = await browser.tabs.get(sender.tab!.id!);
        if (source.origin === new URL(PLAY_BOOKS).origin && source.pathname.startsWith('/books') && !readerKey(current.url ?? '')) await markAway();
      } catch { /* Invalid or removed sender. */ }
    }
    return { ok: true };
  }
  detections.set(tab.id, message.detection);
  let state = await repository.read();
  const visible = message.visible && await eligible(tab.id, tab.windowId, false);
  const foreground = visible && await eligible(tab.id, tab.windowId);
  let book = detectedBook(state, message.detection.key);
  if (!book && await readerPrompts.ignored(tab.id, message.detection.key)) return { ok: true };
  if (foreground && (book || message.detection.supported)) {
    const needsUpdate = !book || state.settings.currentBookId !== book.id
      || (book.pendingTitle && !!message.detection.title) || (book.pendingAuthor && !!message.detection.author)
      || (state.active && state.active.bookId !== book.id);
    if (needsUpdate) state = await repository.update(draft => {
      let current = detectedBook(draft, message.detection.key);
      const now = new Date().toISOString();
      if (!current) {
        current = { id: crypto.randomUUID(), title: message.detection.title ?? `Play Books · ${message.detection.key}`, author: message.detection.author ?? '',
          pendingTitle: !message.detection.title, pendingAuthor: !message.detection.author,
          url: `${PLAY_BOOKS}/reader?id=${encodeURIComponent(message.detection.key!)}`, status: 'reading', notes: '', createdAt: now, updatedAt: now };
        draft.books.push(current);
      } else {
        if (current.pendingTitle && message.detection.title) {
          const previous = current.title;
          current.title = message.detection.title; current.pendingTitle = false; current.updatedAt = now;
          if (draft.active?.bookId === current.id) draft.active.bookTitle = current.title;
          for (const session of draft.sessions) if (session.bookId === current.id && session.bookTitle === previous) session.bookTitle = current.title;
        }
        if (current.pendingAuthor && message.detection.author) { current.author = message.detection.author; current.pendingAuthor = false; current.updatedAt = now; }
      }
      if (draft.active && draft.active.bookId !== current.id) finalize(draft, false);
      draft.settings.currentBookId = current.id;
    });
    book = detectedBook(state, message.detection.key);
  }
  if (prompt && state.active && book?.id === state.active.bookId && (state.active.tabId === tab.id || foreground)) {
    state = await repository.update(draft => {
      if (!draft.active) return;
      if (draft.active.tabId !== tab.id && foreground) { leave(draft.active, Date.now()); draft.active.manualConfirmed = false; draft.active.tabId = tab.id!; draft.active.windowId = tab.windowId!; }
      const result = observe(draft.active, { at: Date.now(), mono: message.mono, token: message.token, timezone: message.timezone,
        eligible: visible && (message.detection.supported || draft.active.manualConfirmed) });
      if (result === 'interrupted') finalize(draft, true);
    });
  } else if (prompt && state.active?.tabId === tab.id) {
    await markAway();
  }
  await syncGrace();
  state = await repository.read();
  if (!book) return { ok: true };
  const started = state.active?.bookId === book.id;
  const showPrompt = !!(prompt && !started && foreground && state.settings.readerPrompt && await readerPrompts.offer(tab.id, message.detection.key, tab.windowId));
  return { ok: true, reader: { key: message.detection.key, title: book.title, author: book.author, pendingTitle: !!book.pendingTitle,
    restore: !!book.archivedAt || book.status === 'completed' || book.status === 'paused', supported: message.detection.supported,
    started, showPrompt, language: state.settings.language,
    sessionId: started ? state.active?.id : undefined, paused: started && state.active?.status === 'paused' } };
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
      if (existing) {
        const pendingTitle = existing.pendingTitle && existing.title === book.title;
        const pendingAuthor = existing.pendingAuthor && existing.author === book.author;
        Object.assign(existing, book, { createdAt: existing.createdAt, updatedAt: now });
        if (existing.pendingTitle !== undefined) existing.pendingTitle = !!pendingTitle;
        if (existing.pendingAuthor !== undefined) existing.pendingAuthor = !!pendingAuthor;
      }
      else draft.books.push({ ...book, createdAt: now, updatedAt: now });
    }); break;
    case 'DELETE_BOOK': await repository.update(draft => {
      if (draft.active?.bookId === command.id) throw new Error('이 책의 독서를 먼저 종료하세요.');
      const book = draft.books.find(b => b.id === command.id); if (book) { book.archivedAt = now; book.updatedAt = now; }
      if (draft.settings.currentBookId === command.id) draft.settings.currentBookId = null;
    }); break;
    case 'PURGE_BOOK': {
      const removed = (await repository.read()).books.find(book => book.id === command.id);
      await repository.update(draft => {
        const book = draft.books.find(b => b.id === command.id);
        if (!command.confirmed || !book?.archivedAt) throw new Error('서재에서 제거한 책만 별도 확인을 거쳐 영구 삭제할 수 있습니다.');
        if (draft.active?.bookId === command.id) throw new Error('진행 중인 독서를 먼저 종료하세요.');
        draft.sessions = draft.sessions.filter(s => s.bookId !== command.id); draft.books = draft.books.filter(b => b.id !== command.id);
        if (draft.settings.currentBookId === command.id) draft.settings.currentBookId = null;
      });
      if (removed?.url) for (const tab of await browser.tabs.query({ url: `${PLAY_BOOKS}*` })) {
        const key = readerKey(removed.url);
        if (tab.id !== undefined && key && readerKey(tab.url ?? '') === key) await readerPrompts.ignore(tab.id, key);
      }
      break;
    }
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
      draft.settings = next;
    }); break;
    case 'OPEN_BOOK': { const state = await repository.read(); await openBook(command.id ? state.books.find(b => b.id === command.id && !b.archivedAt) : recommend(state)); break; }
    case 'START': await start(command.id, command.confirm, command.restore); break;
    case 'PAUSE': await repository.update(draft => { if (draft.active) suspend(draft.active, true); }); break;
    case 'RESUME': await repository.update(draft => { if (draft.active) resume(draft.active); }); break;
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
  await syncGrace();
  if (['PAUSE', 'RESUME'].includes(command.type)) await refreshActiveReader();
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
  if (heartbeatInput.success && sender.tab && !sender.frameId) return serial(async () => { await ready; return heartbeat(heartbeatInput.data, sender); }).catch(error => { report(error); return { ok: false }; });
  const readerAction = readerActionSchema.safeParse(raw);
  if (readerAction.success && sender.tab && !sender.frameId) return serial(async (): Promise<ReaderReply> => {
    await ready;
    const key = readerAction.data.key; const tab = await currentReaderTab(sender, key);
    if (tab?.id === undefined) return { ok: false };
    if (readerAction.data.type === 'READER_DISMISS') { await readerPrompts.dismiss(tab.id, key); return { ok: true }; }
    const evidence = await evidenceFor(tab.id);
    if (!evidence || evidence.detection.key !== key || !evidence.visible || !await eligible(tab.id, tab.windowId)) return { ok: false, error: '책 읽기 화면으로 돌아온 뒤 다시 시작하세요.' };
    if (readerAction.data.type === 'READER_RESUME') {
      const state = await repository.read(); const active = state.active;
      if (!readerAction.data.sessionId || active?.id !== readerAction.data.sessionId || readerKey(state.books.find(book => book.id === active.bookId)?.url ?? '') !== key) return { ok: false, error: '진행 중인 독서가 바뀌었습니다. 책 화면에서 다시 시도하세요.' };
      if (!evidence.detection.supported && !readerAction.data.confirm && !(active.tabId === tab.id && active.manualConfirmed)) return { ok: false, error: '리더 구조를 확인하지 못했습니다. 화면에서 ‘이 탭에서 실제로 읽고 있습니다’를 선택한 뒤 다시 시작하세요.' };
      await repository.update(draft => {
        if (draft.active?.id !== active.id) return;
        resume(draft.active); draft.active.tabId = tab.id!; draft.active.windowId = tab.windowId!;
        draft.active.manualConfirmed = evidence.detection.supported ? false : readerAction.data.confirm || active.manualConfirmed;
      });
      const reply = await heartbeat(evidence, { tab, url: tab.url });
      return reply;
    }
    await heartbeat(evidence, { tab, url: tab.url }, false);
    const book = detectedBook(await repository.read(), key);
    if (!book) return { ok: false, error: '책을 찾을 수 없습니다.' };
    await start(book.id, readerAction.data.confirm, true, tab);
    return { ok: true };
  }).catch(error => ({ ok: false, error: error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도하세요.' }));
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
  if (alarm.name === READING_GRACE_ALARM) { await syncGrace(); await refreshActiveReader(); }
  if ([DAILY_ALARM, SNOOZE_ALARM, RECONCILE_ALARM].includes(alarm.name)) { await staleSession(); await checkPrompt(); await reconcile(); }
}));
browser.runtime.onStartup.addListener(() => event(async () => {
  await readerPrompts.reset();
  await repository.update(draft => finalize(draft, true)); await checkPrompt(); await reconcile();
}));
browser.runtime.onInstalled.addListener(() => event(async () => {
  await readerPrompts.reset();
  await repository.update(draft => finalize(draft, true)); await checkPrompt(); await reconcile();
}));
browser.notifications.onClicked.addListener(id => { if (id === 'readchime.prompt') event(async () => { await openBook(recommend(await repository.read())); await browser.notifications.clear(id); }); });
async function observeForeground() {
  const tab = (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (tab?.id === undefined || !readerKey(tab.url ?? '')) return;
  const evidence = await evidenceFor(tab.id);
  if (evidence) await heartbeat(evidence, { tab, url: tab.url });
}
browser.tabs.onActivated.addListener(() => event(async () => { await staleSession(); await refreshActiveReader(); await observeForeground(); await reconcile(); }));
browser.windows.onFocusChanged.addListener(() => event(async () => { await staleSession(); await refreshActiveReader(); await observeForeground(); await reconcile(); }));
browser.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'loading') event(async () => {
  if (change.url) await readerPrompts.navigate(id, change.url);
  detections.delete(id);
  const state = await repository.read();
  if (state.active?.tabId === id) {
    const key = readerKey(state.books.find(book => book.id === state.active?.bookId)?.url ?? '');
    if (change.status === 'loading' || readerKey(change.url ?? '') !== key) {
      await repository.update(draft => { if (draft.active) { draft.active.manualConfirmed = false; leave(draft.active, Date.now()); } });
      await syncGrace();
    }
  }
}); });
browser.tabs.onRemoved.addListener(id => event(async () => { detections.delete(id); await readerPrompts.remove(id); if ((await repository.read()).active?.tabId === id) await repository.update(draft => finalize(draft, true)); }));
event(reconcile);
