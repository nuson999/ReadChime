import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { readerFixture, libraryFixture } from './fixtures';
import { emptyState, type Book, type ActiveSession, type Session } from '../src/domain/model';
import { canonicalBookUrl, readerKey, recommend } from '../src/domain/books';
import { playBooksDetector } from '../src/domain/detector';
import { nextAlarm, scheduledToday, shouldPrompt, snoozeAt } from '../src/domain/scheduler';
import { localDate, weekStart } from '../src/domain/time';
import { observe, suspend, finish } from '../src/domain/timer';
import { dailySeries, summary, goalFor } from '../src/domain/statistics';
import { LocalRepository, migrate, type StorageAdapter } from '../src/data/repository';
import { exportBackup, mergeBackup, parseBackup, previewMerge } from '../src/data/backup';

const now = '2026-10-21T12:00:00.000Z';
function book(overrides: Partial<Book> = {}): Book { return { id: crypto.randomUUID(), title: '테스트 책', author: '', url: '', status: 'planned', notes: '', createdAt: now, updatedAt: now, ...overrides }; }
function session(bookId: string, overrides: Partial<Session> = {}): Session { return { id: crypto.randomUUID(), bookId, bookTitle: '테스트 책', startedAt: now, endedAt: now, durationSeconds: 120, source: 'manual', measurement: 'entry', device: 'tablet', notes: '', localDate: '2026-10-21', timezone: 'Asia/Seoul', createdAt: now, updatedAt: now, corrected: false, interrupted: false, ...overrides }; }
function active(): ActiveSession { return { id: crypto.randomUUID(), bookId: crypto.randomUUID(), bookTitle: '테스트 책', startedAt: now, tabId: 1, windowId: 1, status: 'running', manualConfirmed: false, automaticStart: false, buckets: [], evidence: null }; }
function evidence(at: number, eligible = true, token = 'tab', timezone = 'Asia/Seoul') { return { at, mono: at, token, eligible, timezone }; }

describe('안전한 책 주소와 추천', () => {
  it('리더 바깥 제목·저자만 읽고 Google 접미사를 제외한다', () => {
    const document = parseHTML(`<html><head><title>Different book - Google Play Books</title><meta name="author" content="Reader Author"></head><body>${readerFixture}</body></html>`).document;
    expect(playBooksDetector.detect('https://play.google.com/books/reader?id=another-id', document)).toMatchObject({ key: 'another-id', supported: true, title: 'Different book', author: 'Reader Author' });
    expect(playBooksDetector.detect('https://play.google.com/books', document)).toMatchObject({ key: null, supported: false });
  });
  it('리더 주소만 허용하고 추적·페이지 파라미터를 제거한다', () => {
    expect(canonicalBookUrl(' https://play.google.com/books/reader?id=test_123&page=9#foo ')).toBe('https://play.google.com/books/reader?id=test_123');
    for (const url of ['javascript:alert(1)', 'https://play.google.com.evil/books/reader?id=a', 'https://x@play.google.com/books/reader?id=a', 'http://play.google.com/books/reader?id=a', 'https://play.google.com/books', 'https://play.google.com/books/reader', 'https://play.google.com:444/books/reader?id=a']) expect(readerKey(url)).toBeNull();
  });
  it('현재 책, 최근 읽은 미완독 책, 읽을 책 순서를 지킨다', () => {
    const state = emptyState(); const planned = book(), recent = book({ lastReadAt: now }), current = book(); state.books = [planned, recent, current]; state.settings.currentBookId = current.id;
    expect(recommend(state)?.id).toBe(current.id); current.status = 'completed'; expect(recommend(state)?.id).toBe(recent.id);
    recent.status = 'paused'; expect(recommend(state)?.id).toBe(planned.id); planned.archivedAt = now; expect(recommend(state)).toBeUndefined();
  });
  it('합성 DOM의 리더 바깥 구조를 홈과 구분한다', () => {
    const reader = readerFixture;
    const library = libraryFixture;
    const root = (html: string) => parseHTML(html).document;
    expect(playBooksDetector.detect('https://play.google.com/books/reader?id=fixture', root(reader)).supported).toBe(true);
    expect(playBooksDetector.detect('https://play.google.com/books', root(reader)).supported).toBe(false);
    expect(playBooksDetector.detect('https://play.google.com/books/reader?id=fixture', root(library)).supported).toBe(false);
  });
});
describe('현지 시각 예약과 알림 정책', () => {
  it('오늘 예정 시각 이전과 이후를 구분한다', () => {
    const before = new Date(2026, 9, 21, 21, 59); const after = new Date(2026, 9, 21, 22, 0);
    expect(new Date(nextAlarm(before, { hour: 22, minute: 0 })).getDate()).toBe(21);
    expect(new Date(nextAlarm(after, { hour: 22, minute: 0 })).getDate()).toBe(22);
  });
  it('놓친 알림은 유예 내 한 번만 보낸다', () => {
    const state = emptyState(); const inside = new Date(2026, 9, 21, 22, 30); expect(shouldPrompt(state, inside)).toBe(true);
    state.reminder.days.push(localDate(inside)); expect(shouldPrompt(state, inside)).toBe(false);
    state.reminder.days = []; state.settings.graceMinutes = 10; expect(shouldPrompt(state, inside)).toBe(false);
  });
  it('자정 뒤 전날 알림을 따라 보내지 않는다', () => {
    const state = emptyState(); state.settings.hour = 23; state.settings.minute = 30;
    expect(shouldPrompt(state, new Date(2026, 9, 22, 0, 30))).toBe(false);
    expect(snoozeAt(new Date(2026, 9, 21, 23, 55), 10)).toBeNull();
  });
  it('명시적 다시 알림은 당일 중복 억제를 해제하지만 건너뛰기는 우선한다', () => {
    const state = emptyState(); const date = new Date(2026, 9, 21, 22, 5); const day = localDate(date);
    state.reminder.days = [day]; state.reminder.snooze = snoozeAt(date, 10);
    expect(shouldPrompt(state, new Date(2026, 9, 21, 22, 14), true)).toBe(false);
    expect(shouldPrompt(state, new Date(2026, 9, 21, 22, 15), true)).toBe(true);
    state.reminder.skipped = [day]; expect(shouldPrompt(state, new Date(2026, 9, 21, 22, 15), true)).toBe(false);
  });
  it('목표 달성 또는 측정 중에는 알리지 않는다', () => {
    const state = emptyState(); const b = book(); state.books = [b]; const at = new Date(2026, 9, 21, 22, 0);
    state.sessions = [session(b.id, { localDate: localDate(at), durationSeconds: 300 })]; expect(shouldPrompt(state, at)).toBe(false);
    state.sessions = []; state.active = active(); expect(shouldPrompt(state, at)).toBe(false);
  });
  it('DST 전환도 실제 현지 22시를 예약한다', () => {
    const previous = process.env.TZ; process.env.TZ = 'America/New_York';
    try { const date = new Date('2026-03-07T23:00:00-05:00'); const next = new Date(nextAlarm(date, { hour: 22, minute: 0 })); expect(next.getHours()).toBe(22); expect(next.toISOString()).toBe('2026-03-09T02:00:00.000Z'); expect(scheduledToday(date, { hour: 22, minute: 0 }).getHours()).toBe(22); }
    finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
});
describe('타이머의 보수적인 상태 전이', () => {
  it('서로 이어지는 전면 관측 사이만 누적하고 짧은 세션도 저장한다', () => {
    const timer = active(); const base = Date.parse(now); observe(timer, evidence(base)); observe(timer, evidence(base + 5000)); observe(timer, evidence(base + 10000));
    expect(finish(timer, now, false)[0].durationSeconds).toBe(10);
  });
  it('잠깐 숨겨진 시간은 제외하고 5초 안에만 버튼 없이 재개한다', () => {
    const timer = active(); const base = Date.parse(now); observe(timer, evidence(base)); observe(timer, evidence(base + 5000, false)); expect(timer.status).toBe('waiting');
    observe(timer, evidence(base + 10000)); observe(timer, evidence(base + 15000));
    expect(finish(timer, now, false)[0].durationSeconds).toBe(5); expect(timer.status).toBe('running');
  });
  it('5초를 넘게 숨겨지면 복귀 관측으로 일시정지가 풀리지 않는다', () => {
    const timer = active(); const base = Date.parse(now);
    observe(timer, evidence(base)); observe(timer, evidence(base + 1000, false));
    observe(timer, evidence(base + 6001)); observe(timer, evidence(base + 11001));
    expect(timer.status).toBe('paused'); expect(timer.buckets).toEqual([]);
  });
  it('명시적 일시정지는 포커스 복귀로 풀리지 않는다', () => {
    const timer = active(); const base = Date.parse(now); suspend(timer, true); observe(timer, evidence(base)); observe(timer, evidence(base + 5000)); expect(timer.status).toBe('paused'); expect(timer.buckets).toHaveLength(0);
  });
  it('절전·시계 역행·증거 지연 구간을 더하지 않는다', () => {
    const base = Date.parse(now);
    for (const delta of [60000, -5000]) { const timer = active(); observe(timer, evidence(base)); expect(observe(timer, evidence(base + delta))).toBe('interrupted'); expect(timer.buckets).toHaveLength(0); }
    const timer = active(); observe(timer, evidence(base)); expect(observe(timer, { ...evidence(base + 5000), mono: base + 100 })).toBe('interrupted');
  });
  it('다른 문서의 관측을 이어 붙이지 않는다', () => {
    const timer = active(); const base = Date.parse(now); observe(timer, evidence(base)); observe(timer, evidence(base + 5000, true, 'new-document')); expect(timer.buckets).toHaveLength(0);
  });
  it('자정을 넘긴 구간은 각각의 현지 날짜에 나눈다', () => {
    const timer = active(); const base = Date.parse('2026-10-21T14:59:57Z'); observe(timer, evidence(base)); observe(timer, evidence(base + 10000));
    const records = finish(timer, now, true); expect(records.map(s => [s.localDate, s.durationSeconds])).toEqual([['2026-10-21', 3], ['2026-10-22', 7]]); expect(records.every(s => s.interrupted)).toBe(true);
  });
  it('목표 5분 달성이 타이머를 종료시키지 않는다', () => {
    const timer = active(); const base = Date.parse(now); for (let i = 0; i <= 70; i++) observe(timer, evidence(base + i * 5000));
    expect(timer.status).toBe('running'); expect(finish(timer, now, false)[0].durationSeconds).toBe(350);
  });
});
describe('날짜와 통계', () => {
  it('같은 날 여러 기기의 기록을 합산하고 시간대 이동 뒤에도 보존한다', () => {
    const state = emptyState(); const b = book(); state.books = [b]; state.sessions = [session(b.id), session(b.id, { durationSeconds: 180, device: 'paper' })];
    expect(summary(state, '2026-10-21').todaySeconds).toBe(300); expect(dailySeries(state, 7, '2026-10-21').at(-1)?.complete).toBe(true);
    expect(localDate(new Date(now), 'America/Los_Angeles')).toBe('2026-10-21'); expect(state.sessions[0].localDate).toBe('2026-10-21');
  });
  it('오늘 목표 변경은 과거의 목표를 바꾸지 않는다', () => { const state = emptyState(); state.goals.push({ from: '2026-10-21', minutes: 20 }); expect(goalFor(state, '2026-10-20')).toBe(5); expect(goalFor(state, '2026-10-21')).toBe(20); });
  it('주간 통계는 월요일부터 시작한다', () => { expect(weekStart('2026-10-25')).toBe('2026-10-19'); expect(weekStart('2026-10-26')).toBe('2026-10-26'); });
});
describe('저장소·버전·백업', () => {
  it('동시 수정이 서로 덮어쓰지 않는다', async () => {
    let data: unknown; const adapter: StorageAdapter = { async get() { return data; }, async set(value) { await Promise.resolve(); data = structuredClone(value); } }; const repo = new LocalRepository(adapter);
    await Promise.all(Array.from({ length: 20 }, () => repo.update(state => state.books.push(book())))); expect((await repo.read()).books).toHaveLength(20); expect((await repo.read()).revision).toBe(20);
  });
  it('쓰기 실패 시 이전 상태를 보존하고 다음 작업을 계속 처리한다', async () => {
    let fail = false; const repo = new LocalRepository({ async get() { return emptyState(); }, async set() { if (fail) throw new Error('저장 실패'); } });
    await repo.read(); fail = true; await expect(repo.update(state => state.books.push(book()))).rejects.toThrow(); expect((await repo.read()).books).toHaveLength(0); fail = false; await repo.update(state => state.books.push(book())); expect((await repo.read()).books).toHaveLength(1);
  });
  it('버전 1을 날짜 기준이 명시된 버전 2로 이전한다', () => { const state = emptyState(); const b = book(); state.books = [b]; state.sessions = [session(b.id)]; const old = { ...state, schemaVersion: 1 }; const migrated = migrate(old); expect(migrated.schemaVersion).toBe(2); expect(migrated.sessions[0].timezone).toBe('UTC'); });
  it('알 수 없는 미래 버전·잘못된 날짜·분량·참조를 거부한다', () => {
    expect(() => migrate({ schemaVersion: 900 })).toThrow(); const state = emptyState(); const b = book(); state.books = [b];
    state.sessions = [session(b.id, { localDate: '2026-02-30' })]; expect(() => parseBackup(exportBackup(state))).toThrow();
    state.sessions = [session(b.id, { durationSeconds: -1 })]; expect(() => parseBackup(exportBackup(state))).toThrow();
    state.sessions = [session(crypto.randomUUID())]; expect(() => parseBackup(exportBackup(state))).toThrow();
  });
  it('백업은 완료된 기록만 내보내고 ID로 중복을 제거한다', () => {
    const state = emptyState(); const b = book(); state.books = [b]; state.sessions = [session(b.id)]; state.active = { ...active(), bookId: b.id };
    const imported = parseBackup(exportBackup(state)); expect(imported.active).toBeNull();
    const merged = mergeBackup(state, imported, [], false); expect(merged.sessions).toHaveLength(1); expect(previewMerge(state, imported).identical).toBe(2);
  });
  it('충돌을 알리고 기본값은 현재 기록과 설정을 보존한다', () => {
    const state = emptyState(); const b = book(); state.books = [b]; state.sessions = [session(b.id)]; const incoming = structuredClone(state); incoming.sessions[0].durationSeconds = 600; incoming.settings.goalMinutes = 20;
    expect(previewMerge(state, incoming).conflicts).toHaveLength(1); expect(mergeBackup(state, incoming, [], false).sessions[0].durationSeconds).toBe(120);
    const chosen = mergeBackup(state, incoming, [state.sessions[0].id], true); expect(chosen.sessions[0].durationSeconds).toBe(600); expect(chosen.settings.goalMinutes).toBe(20);
  });
});
