import { z } from 'zod';
import { canonicalBookUrl, readerKey } from './books';
import type { Book, State } from './model';

export const MAX_LIBRARY_BOOKS = 2000;
export const LIBRARY_PREVIEW_KEY = 'readchime.libraryPreview';
export const LIBRARY_PREVIEW_TTL = 10 * 60 * 1000;
export const libraryKeySchema = z.string().regex(/^[a-zA-Z0-9_\-=.]{1,256}$/);
export const libraryBookSchema = z.object({
  key: libraryKeySchema, title: z.string().trim().min(1).max(300),
  author: z.string().max(200), url: z.string().max(2048),
}).refine(book => readerKey(book.url) === book.key, '책 주소와 ID가 일치하지 않습니다.');
export const libraryScanSchema = z.object({
  status: z.enum(['ready', 'empty', 'login-required', 'loading', 'unsupported']),
  books: z.array(libraryBookSchema).max(MAX_LIBRARY_BOOKS),
  cardsSeen: z.number().int().min(0).max(MAX_LIBRARY_BOOKS),
  invalidCards: z.number().int().min(0).max(MAX_LIBRARY_BOOKS),
  duplicateCards: z.number().int().min(0).max(MAX_LIBRARY_BOOKS),
  hasNextPage: z.boolean(), hasShowAll: z.boolean(), limitReached: z.boolean(),
});
export type LibraryBook = z.infer<typeof libraryBookSchema>;
export type LibraryScan = z.infer<typeof libraryScanSchema>;
export const libraryCandidateSchema = libraryBookSchema.safeExtend({
  kind: z.enum(['new', 'existing', 'enrich', 'archived', 'duplicate']),
  existingIds: z.array(z.uuid()).max(20000),
});
export type LibraryCandidate = z.infer<typeof libraryCandidateSchema>;
export const libraryPreviewSchema = z.object({
  id: z.uuid(), scannedAt: z.number().finite(), tabId: z.number().int(),
  scan: libraryScanSchema.omit({ books: true }),
  candidates: z.array(libraryCandidateSchema).max(MAX_LIBRARY_BOOKS),
});
export type LibraryPreview = z.infer<typeof libraryPreviewSchema>;
export interface LibraryTab { id: number; windowId: number; position: number; title: string }
export interface LibraryFlow {
  status: 'opened' | 'choose-tab' | 'scanned';
  tabs: LibraryTab[];
  preview?: LibraryPreview;
}
export interface LibraryApplied { added: number; restored: number; enriched: number; skipped: number }

export function isLibraryUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'play.google.com' && !url.username && !url.password && !url.port
      && (url.pathname === '/books' || url.pathname === '/books/');
  } catch { return false; }
}
function metadata(element: Element | null): string {
  return (element?.getAttribute('title')?.trim() || element?.textContent || '').replace(/\s+/g, ' ').trim();
}
function enabled(button: Element): boolean {
  return !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true';
}

// Read-only, synchronous extraction. Nothing calls this on a timer, observer, or page visit.
export function scanLibraryPage(url: string, document: Pick<Document, 'querySelector' | 'querySelectorAll'>): LibraryScan {
  const result: LibraryScan = { status: 'unsupported', books: [], cardsSeen: 0, invalidCards: 0, duplicateCards: 0,
    hasNextPage: false, hasShowAll: false, limitReached: false };
  if (!isLibraryUrl(url)) return result;
  const library = document.querySelector('gpb-library-home');
  const shelf = library?.querySelector('gpb-shelf-page');
  const selected = library?.querySelector('a.navbar-item.your-books.selected');
  if (!library || !shelf || !selected) {
    const login = [...document.querySelectorAll('a[href]')].some(link => {
      try { const target = new URL(link.getAttribute('href')!, url); return target.hostname === 'accounts.google.com' && /ServiceLogin|signin/i.test(target.pathname); }
      catch { return false; }
    });
    if (login) result.status = 'login-required';
    else if (document.querySelector('[aria-busy="true"], [role="progressbar"], mat-progress-spinner')) result.status = 'loading';
    return result;
  }
  const grid = shelf.querySelector('.-gb-book-card-grid');
  if (shelf.querySelector('[aria-busy="true"], [role="progressbar"], mat-progress-spinner')) { result.status = 'loading'; return result; }
  if (!grid) return result;
  const controls = [...shelf.querySelectorAll('.page-controls .pagination-button')];
  result.hasShowAll = controls.some(button => button.classList.contains('pagination-toggle-button') && enabled(button));
  // The saved UI has one enabled next button and a disabled previous button.
  // Any enabled page navigation conservatively indicates more than this view.
  result.hasNextPage = controls.some(button => !button.classList.contains('pagination-toggle-button') && enabled(button));
  const cards = [...grid.querySelectorAll('div.card.ebook')];
  result.limitReached = cards.length > MAX_LIBRARY_BOOKS;
  const found = new Map<string, LibraryBook>();
  for (const card of cards.slice(0, MAX_LIBRARY_BOOKS)) {
    result.cardsSeen++;
    const keys = new Set<string>();
    for (const link of card.querySelectorAll('a.card-link[href], a.cover-link[href], .metadata a.title[href]')) {
      try { const key = readerKey(new URL(link.getAttribute('href')!, url).href); if (key) keys.add(key); } catch { /* Invalid card link. */ }
    }
    const key = [...keys][0];
    const title = metadata(card.querySelector('.metadata a.title'));
    const author = metadata(card.querySelector('.metadata a.author'));
    if (keys.size !== 1 || !title || title.length > 300) { result.invalidCards++; continue; }
    const book: LibraryBook = { key, title, author: author.length <= 200 ? author : '',
      url: canonicalBookUrl(`https://play.google.com/books/reader?id=${encodeURIComponent(key)}`) };
    const previous = found.get(key);
    if (previous) { result.duplicateCards++; if (!previous.author) previous.author = book.author; }
    else found.set(key, book);
  }
  result.books = [...found.values()];
  result.status = result.books.length ? 'ready' : cards.length ? 'unsupported' : 'empty';
  return result;
}

export function classifyLibraryBooks(books: Book[], found: LibraryBook[]): LibraryCandidate[] {
  const matches = new Map<string, Book[]>();
  for (const book of books) {
    const key = readerKey(book.url); if (!key) continue;
    matches.set(key, [...(matches.get(key) ?? []), book]);
  }
  return found.map(source => {
    const existing = matches.get(source.key) ?? [];
    const kind: LibraryCandidate['kind'] = existing.length > 1 ? 'duplicate' : !existing.length ? 'new'
      : existing[0].archivedAt ? 'archived' : !existing[0].author.trim() && source.author ? 'enrich' : 'existing';
    return { ...source, kind, existingIds: existing.map(book => book.id).sort() };
  });
}

// Recheck only selected identities so timer checkpoints do not invalidate a preview.
export function applyLibrarySelection(state: State, preview: LibraryPreview, keys: string[], now = Date.now()): LibraryApplied {
  if (now < preview.scannedAt || now - preview.scannedAt > LIBRARY_PREVIEW_TTL) throw new Error('감지 결과가 만료됐습니다. 목록을 다시 감지하세요.');
  const result: LibraryApplied = { added: 0, restored: 0, enriched: 0, skipped: 0 };
  const selected = [...new Set(keys)];
  if (!selected.length) throw new Error('서재에 반영할 책을 선택하세요.');
  const rows = selected.map(key => {
    const previous = preview.candidates.find(row => row.key === key);
    if (!previous || previous.kind === 'duplicate' || previous.kind === 'existing') throw new Error('선택할 수 없는 책이 포함되어 있습니다.');
    const current = classifyLibraryBooks(state.books, [previous])[0];
    const sameIds = JSON.stringify(previous.existingIds) === JSON.stringify(current.existingIds);
    if (previous.kind === 'new' && (current.kind === 'existing' || current.kind === 'enrich')) return null;
    if (previous.kind === 'enrich' && current.kind === 'existing' && sameIds) return null;
    if (previous.kind !== current.kind || !sameIds) throw new Error('선택한 책의 등록·제거 상태가 바뀌었습니다. 목록을 다시 감지한 뒤 선택하세요.');
    return current;
  });
  const instant = new Date(now).toISOString();
  for (const row of rows) {
    if (!row) { result.skipped++; continue; }
    if (row.kind === 'new') {
      state.books.push({ id: crypto.randomUUID(), title: row.title, author: row.author, url: row.url,
        status: 'planned', notes: '', createdAt: instant, updatedAt: instant }); result.added++;
    } else {
      const book = state.books.find(book => book.id === row.existingIds[0])!;
      if (row.kind === 'archived') { delete book.archivedAt; result.restored++; }
      if (!book.author.trim() && row.author) { book.author = row.author; result.enriched++; }
      book.updatedAt = instant;
    }
  }
  return result;
}
