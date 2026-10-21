import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { libraryFixture } from './fixtures';
import { applyLibrarySelection, classifyLibraryBooks, isLibraryUrl, LIBRARY_PREVIEW_KEY, LIBRARY_PREVIEW_TTL,
  scanLibraryPage, type LibraryPreview } from '../src/domain/library';
import { emptyState, type Book, type State } from '../src/domain/model';
import { LibraryImporter } from '../src/background/library';
import { LocalRepository } from '../src/data/repository';

const at = '2026-10-21T12:00:00.000Z';
const url = 'https://play.google.com/books';
const readUrl = (id: string) => `${url}/reader?id=${id}`;
function book(overrides: Partial<Book> = {}): Book { return { id: crypto.randomUUID(), title: '내가 정한 제목', author: '', url: readUrl('same'), notes: '내 메모', status: 'reading', createdAt: at, updatedAt: at, ...overrides }; }
function card(id: string, title = '가져온 제목', author = '가져온 저자') {
  return `<div class="card ebook"><a class="card-link" href="${readUrl(id)}"></a><a class="cover-link" href="${readUrl(id)}"></a><div class="metadata"><a class="title" href="${readUrl(id)}">${title}</a><a class="author">${author}</a></div></div>`;
}
function library(cards = '', extra = '') { return `<gpb-library-home><a class="navbar-item your-books selected"></a><gpb-shelf-page>${extra}<div class="-gb-book-card-grid">${cards}</div></gpb-shelf-page></gpb-library-home>`; }
function scan(html: string, page = url) { return scanLibraryPage(page, parseHTML(html).document as unknown as Document); }
function preview(state: State, markup = library(card('same'))): LibraryPreview {
  const { books, ...metadata } = scan(markup);
  return { id: crypto.randomUUID(), scannedAt: Date.parse(at), tabId: 1, scan: metadata, candidates: classifyLibraryBooks(state.books, books) };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('화면에서만 읽는 서재 감지', () => {
  it('합성 서재 100권을 추출하고 세 번 반복된 링크를 책으로 중복 집계하지 않는다', () => {
    const result = scan(libraryFixture);
    expect(result.status).toBe('ready'); expect(result.books).toHaveLength(100); expect(result.cardsSeen).toBe(100);
    expect(new Set(result.books.map(book => book.key)).size).toBe(100);
    expect(result.books.filter(book => book.author)).toHaveLength(99);
    expect(result.hasNextPage).toBe(true); expect(result.hasShowAll).toBe(true);
  });
  it('공개 스토어의 카드·추천 링크를 내 서재로 취급하지 않는다', () => {
    expect(scan(`<div>${card('recommendation')}</div>`).status).toBe('unsupported');
    expect(scan(`<gpb-library-home><gpb-shelf-page><div class="-gb-book-card-grid">${card('not-selected')}</div></gpb-shelf-page></gpb-library-home>`).books).toHaveLength(0);
  });
  it('로그인 필요·로딩·지원하지 않는 화면·실제 빈 그리드를 구분한다', () => {
    expect(scan('<a href="https://accounts.google.com/ServiceLogin">로그인</a>').status).toBe('login-required');
    expect(scan(library('', '<div role="progressbar"></div>')).status).toBe('loading');
    expect(scan('<main>알 수 없는 화면</main>').status).toBe('unsupported');
    expect(scan(library()).status).toBe('empty');
  });
  it('그리드 밖 선반·추천 링크와 손상된 카드, 안전하지 않은 주소를 제외한다', () => {
    const markup = library(card('valid') + card('broken', '') + card('other').replaceAll(readUrl('other'), 'https://example.com/books/reader?id=other')) + card('outside');
    const result = scan(markup); expect(result.books.map(book => book.key)).toEqual(['valid']); expect(result.invalidCards).toBe(2);
    expect(isLibraryUrl(`${url}/reader?id=valid`)).toBe(false); expect(isLibraryUrl('https://play.google.com.evil/books')).toBe(false);
  });
  it('한 카드 안의 불일치 ID는 거부하고 같은 책의 반복 카드는 합친다', () => {
    const mismatch = card('bad').replace('class="card-link" href="https://play.google.com/books/reader?id=bad"', 'class="card-link" href="https://play.google.com/books/reader?id=different"');
    const result = scan(library(card('same', '같은 책', '') + card('same') + mismatch));
    expect(result.books).toHaveLength(1); expect(result.books[0].author).toBe('가져온 저자'); expect(result.duplicateCards).toBe(1); expect(result.invalidCards).toBe(1);
  });
  it('책이 너무 많으면 제한 사실을 표시하며 페이지 버튼을 누르지 않는다', () => {
    const html = library(Array.from({ length: 2001 }, (_, index) => card(`book${index}`)).join(''));
    const result = scan(html); expect(result.books).toHaveLength(2000); expect(result.limitReached).toBe(true);
  });
});

describe('선택 반영과 기존 데이터 보존', () => {
  it('같은 제목의 주소 없는 수동 책을 합치지 않고 신규를 읽을 책으로 추가한다', () => {
    const state = emptyState(); const manual = book({ title: '가져온 제목', url: '' }); state.books = [manual]; state.settings.currentBookId = manual.id;
    const plan = preview(state); const result = applyLibrarySelection(state, plan, ['same'], Date.parse(at));
    expect(result.added).toBe(1); expect(state.books).toHaveLength(2); expect(state.books[1].status).toBe('planned'); expect(state.settings.currentBookId).toBe(manual.id); expect(state.books[0]).toEqual(manual);
  });
  it('기존 UUID·제목·상태·메모·시각은 유지하고 선택한 빈 저자만 보완한다', () => {
    const state = emptyState(); const original = book(); state.books = [original]; const plan = preview(state);
    expect(plan.candidates[0].kind).toBe('enrich'); applyLibrarySelection(state, plan, ['same'], Date.parse(at) + 1000);
    expect(state.books[0]).toEqual({ ...original, author: '가져온 저자', updatedAt: new Date(Date.parse(at) + 1000).toISOString() });
  });
  it('제거된 책은 기본적으로 복원하지 않으며 명시 선택한 경우 같은 UUID로 복원한다', () => {
    const state = emptyState(); state.books = [book({ archivedAt: at })]; const originalId = state.books[0].id; const plan = preview(state);
    expect(plan.candidates[0].kind).toBe('archived'); expect(state.books[0].archivedAt).toBe(at);
    applyLibrarySelection(state, plan, ['same'], Date.parse(at)); expect(state.books[0].archivedAt).toBeUndefined(); expect(state.books[0].id).toBe(originalId); expect(state.books[0].status).toBe('reading');
  });
  it('기존 중복 UUID를 병합하거나 추가하지 않는다', () => {
    const state = emptyState(); state.books = [book(), book({ archivedAt: at })]; const plan = preview(state);
    expect(plan.candidates[0].kind).toBe('duplicate'); expect(() => applyLibrarySelection(state, plan, ['same'], Date.parse(at))).toThrow('선택할 수 없는'); expect(state.books).toHaveLength(2);
  });
  it('현재 화면에서 발견되지 않은 책·세션은 변경하지 않는다', () => {
    const state = emptyState(); const original = book({ url: readUrl('absent') }); state.books = [original];
    applyLibrarySelection(state, preview(state), ['same'], Date.parse(at)); expect(state.books[0]).toEqual(original); expect(state.sessions).toEqual([]);
  });
  it('미리보기 이후 수동 추가한 책은 중복 생성하지 않고 수동 저자를 덮어쓰지 않는다', () => {
    const state = emptyState(); const plan = preview(state); state.books.push(book({ author: '사용자 저자' }));
    const result = applyLibrarySelection(state, plan, ['same'], Date.parse(at)); expect(result.skipped).toBe(1); expect(state.books).toHaveLength(1); expect(state.books[0].author).toBe('사용자 저자');
  });
  it('선택한 기존 책의 제거 상태가 바뀌면 일부만 반영하지 않고 거부한다', () => {
    const state = emptyState(); state.books = [book()]; const plan = preview(state, library(card('new') + card('same')));
    state.books[0].archivedAt = at;
    expect(() => applyLibrarySelection(state, plan, ['new', 'same'], Date.parse(at))).toThrow('상태가 바뀌'); expect(state.books).toHaveLength(1);
  });
  it('결과 만료와 위조한 선택을 거부하고 타이머의 revision 변경은 허용한다', () => {
    const state = emptyState(); const plan = preview(state);
    expect(() => applyLibrarySelection(state, plan, ['same'], Date.parse(at) + LIBRARY_PREVIEW_TTL + 1)).toThrow('만료');
    expect(() => applyLibrarySelection(state, plan, ['not-listed'], Date.parse(at))).toThrow('선택할 수 없는');
    state.revision += 20; expect(applyLibrarySelection(state, plan, ['same'], Date.parse(at)).added).toBe(1);
  });
});

describe('서재 탭 선택·명령·휘발성 미리보기', () => {
  function setup(tabCount = 1) {
    vi.useFakeTimers(); vi.setSystemTime(new Date(at));
    const stored = emptyState(); const session: Record<string, unknown> = {};
    const repository = new LocalRepository({ async get() { return stored; }, async set(next) { Object.assign(stored, next); } });
    const tabs = Array.from({ length: tabCount }, (_, index) => ({ id: index + 1, windowId: 1, index, title: 'Play Books', url }));
    const api = { tabs: { query: vi.fn(async () => tabs), get: vi.fn(async (id: number) => tabs.find(tab => tab.id === id)),
      create: vi.fn(async () => ({})), update: vi.fn(), sendMessage: vi.fn(async () => scan(library(card('same')))) },
    windows: { get: vi.fn(async () => ({ state: 'normal' })), update: vi.fn() },
    storage: { session: { get: vi.fn(async () => session), set: vi.fn(async (value: object) => Object.assign(session, value)), remove: vi.fn(async (key: string) => { delete session[key]; }) } } };
    vi.stubGlobal('browser', api);
    return { importer: new LibraryImporter(repository), api, stored, session, repository };
  }
  it('아무 명령이 없으면 감지하지 않고 탭이 여럿이면 선택 전 읽지 않는다', async () => {
    const { importer, api } = setup(2); expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    const flow = await importer.scan(); expect(flow.status).toBe('choose-tab'); expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    await importer.scan(2); expect(api.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'SCAN_LIBRARY' }, { frameId: 0 });
  });
  it('탭이 없으면 한 번 열어 안내하고 자동 재감지하지 않는다', async () => {
    const { importer, api } = setup(0); expect((await importer.scan()).status).toBe('opened'); await vi.advanceTimersByTimeAsync(60000);
    expect(api.tabs.create).toHaveBeenCalledTimes(1); expect(api.tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('감지는 영구 서재를 바꾸지 않고 확인된 선택만 저장하며 재반영을 거부한다', async () => {
    const { importer, stored, session } = setup(); const flow = await importer.scan(); expect(stored.books).toHaveLength(0);
    expect(session[LIBRARY_PREVIEW_KEY]).toBeTruthy(); await importer.apply(flow.preview!.id, ['same']); expect(stored.books).toHaveLength(1);
    await expect(importer.apply(flow.preview!.id, ['same'])).rejects.toThrow('결과가 없거나');
  });
  it('이벤트 페이지 인스턴스가 바뀌어도 세션 미리보기를 선택 반영할 수 있다', async () => {
    const { importer, repository, stored } = setup(); const flow = await importer.scan();
    const reawakened = new LibraryImporter(repository); await reawakened.apply(flow.preview!.id, ['same']); expect(stored.books).toHaveLength(1);
  });
  it('탭 연결 실패와 잘못된 응답을 저장하지 않는다', async () => {
    const { importer, api, stored } = setup(); api.tabs.sendMessage.mockRejectedValueOnce(new Error('unavailable'));
    await expect(importer.scan()).rejects.toThrow('접근 권한'); expect(stored.books).toHaveLength(0);
    api.tabs.sendMessage.mockResolvedValueOnce({} as ReturnType<typeof scan>); await expect(importer.scan()).rejects.toThrow('감지 결과');
  });
});
