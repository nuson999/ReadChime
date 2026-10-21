import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import type { Runtime } from 'webextension-polyfill';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('페이지 방문·타이머 관측·포커스 이벤트는 서재를 감지하지 않고 명시 메시지만 감지한다', async () => {
  vi.resetModules(); vi.useFakeTimers();
  const { document, window } = parseHTML('<gpb-library-home><a class="navbar-item your-books selected"></a><gpb-shelf-page><div class="-gb-book-card-grid"></div></gpb-shelf-page></gpb-library-home>');
  let listener: (message: unknown, sender: Runtime.MessageSender) => unknown = () => undefined;
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('location', { href: 'https://play.google.com/books' });
  vi.stubGlobal('browser', { runtime: { id: 'own-extension', sendMessage: vi.fn(async () => ({})), onMessage: { addListener: (value: typeof listener) => { listener = value; } } } });
  const library = await import('../src/domain/library'); const spy = vi.spyOn(library, 'scanLibraryPage');
  await import('../src/content/index');
  await vi.advanceTimersByTimeAsync(15000); window.dispatchEvent(new window.Event('focus')); document.dispatchEvent(new window.Event('visibilitychange'));
  expect(spy).not.toHaveBeenCalled();
  expect(listener({ type: 'SCAN_LIBRARY' }, { id: 'another-extension' })).toBeUndefined(); expect(spy).not.toHaveBeenCalled();
  const result = await listener({ type: 'SCAN_LIBRARY' }, { id: 'own-extension' });
  expect(result).toMatchObject({ status: 'empty' }); expect(spy).toHaveBeenCalledTimes(1);
});
