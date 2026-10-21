import type { Book, State } from './model';

export const PLAY_BOOKS = 'https://play.google.com/books';
export function readerKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'play.google.com' || url.port || url.username || url.password || url.pathname !== '/books/reader') return null;
    const key = url.searchParams.get('id');
    return key && /^[a-zA-Z0-9_\-=.]{1,256}$/.test(key) ? key : null;
  } catch { return null; }
}
export function canonicalBookUrl(raw: string): string {
  const key = readerKey(raw.trim());
  if (!key) throw new Error('Play Books에서 책을 연 뒤 https://play.google.com/books/reader?id=… 형태의 주소를 복사하세요.');
  return `${PLAY_BOOKS}/reader?id=${encodeURIComponent(key)}`;
}
export function recommend(state: Pick<State, 'books' | 'settings'>): Book | undefined {
  const eligible = state.books.filter(b => !b.archivedAt && b.status !== 'completed' && b.status !== 'paused');
  return eligible.find(b => b.id === state.settings.currentBookId)
    ?? eligible.filter(b => b.lastReadAt).sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))[0]
    ?? eligible.find(b => b.status === 'reading') ?? eligible.find(b => b.status === 'planned');
}
