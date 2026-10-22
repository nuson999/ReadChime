import { afterEach, expect, it, vi } from 'vitest';
import { ReaderPrompts } from '../src/background/reader-prompts';

afterEach(() => vi.unstubAllGlobals());
it('keeps a dismissed reader across event-page reload and refresh, resets on another book or tab closure', async () => {
  const memory: Record<string, unknown> = {};
  const openPopup = vi.fn(async () => undefined);
  vi.stubGlobal('browser', { storage: { session: { get: async () => structuredClone(memory), set: async (data: object) => Object.assign(memory, structuredClone(data)) } }, action: { openPopup } });
  const first = new ReaderPrompts();
  expect(await first.offer(1, 'book-a', 1)).toBe(false);
  await first.dismiss(1, 'book-a');
  const restored = new ReaderPrompts();
  await restored.navigate(1, 'https://play.google.com/books/reader?id=book-a&pg=23');
  expect(await restored.offer(1, 'book-a', 1)).toBe(false); expect(openPopup).toHaveBeenCalledTimes(1);
  await restored.navigate(1, 'https://play.google.com/books/reader?id=book-b');
  await restored.offer(1, 'book-b', 1); expect(openPopup).toHaveBeenCalledTimes(2);
  await restored.remove(1); await restored.offer(1, 'book-b', 1); expect(openPopup).toHaveBeenCalledTimes(3);
});
