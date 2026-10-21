import { LocalRepository } from '../data/repository';
import { PLAY_BOOKS } from '../domain/books';
import { applyLibrarySelection, classifyLibraryBooks, isLibraryUrl, LIBRARY_PREVIEW_KEY, libraryPreviewSchema,
  libraryScanSchema, type LibraryApplied, type LibraryFlow, type LibraryPreview, type LibraryTab } from '../domain/library';

function withoutFragment(url: string) { return url.split('#')[0]; }

export class LibraryImporter {
  constructor(private readonly repository: LocalRepository) {}

  private async tabs(): Promise<LibraryTab[]> {
    return (await browser.tabs.query({ url: `${PLAY_BOOKS}*` }))
      .filter(tab => tab.id !== undefined && tab.windowId !== undefined && isLibraryUrl(tab.url ?? ''))
      .map(tab => ({ id: tab.id!, windowId: tab.windowId!, position: tab.index + 1, title: (tab.title || 'Play Books 서재').slice(0, 160) }));
  }

  async focus(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (!isLibraryUrl(tab.url ?? '') || tab.windowId === undefined) throw new Error('선택한 서재 탭이 닫혔거나 다른 페이지로 바뀌었습니다. 다시 감지하세요.');
    const window = await browser.windows.get(tab.windowId);
    await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(tab.windowId, { focused: true, ...(window.state === 'minimized' ? { state: 'normal' as const } : {}) });
  }

  // Only a dashboard SCAN_LIBRARY command calls this method. Never retry automatically.
  async scan(tabId?: number): Promise<LibraryFlow> {
    const tabs = await this.tabs();
    if (tabId === undefined && tabs.length === 0) {
      await browser.tabs.create({ url: PLAY_BOOKS, active: true });
      return { status: 'opened', tabs: [] };
    }
    if (tabId === undefined && tabs.length > 1) return { status: 'choose-tab', tabs };
    const selected = tabs.find(tab => tab.id === (tabId ?? tabs[0]?.id));
    if (!selected) throw new Error('선택한 서재 탭을 찾을 수 없습니다. 다시 감지하세요.');
    const before = await browser.tabs.get(selected.id);
    if (!isLibraryUrl(before.url ?? '')) throw new Error('내 서재 페이지를 연 뒤 다시 감지하세요.');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let raw: unknown;
    try {
      raw = await Promise.race([
        browser.tabs.sendMessage(selected.id, { type: 'SCAN_LIBRARY' }, { frameId: 0 }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('응답 시간이 초과됐습니다. 서재를 다 불러왔는지, 접근 권한이 있는지 확인하고 다시 감지하세요.')), 8000); }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('응답 시간')) throw error;
      throw new Error('서재 탭에 연결하지 못했습니다. Play Books 접근 권한을 확인하고 해당 탭을 새로고침한 뒤 다시 감지하세요.');
    } finally { if (timeout) clearTimeout(timeout); }
    const parsed = libraryScanSchema.safeParse(raw);
    if (!parsed.success) throw new Error('서재 감지 결과를 확인하지 못했습니다. 확장과 서재 탭을 새로고침한 뒤 다시 감지하세요.');
    const after = await browser.tabs.get(selected.id);
    if (!isLibraryUrl(after.url ?? '') || withoutFragment(before.url ?? '') !== withoutFragment(after.url ?? '')) throw new Error('감지하는 동안 서재 탭이 변경됐습니다. 다시 감지하세요.');
    const { books, ...scan } = parsed.data;
    const preview: LibraryPreview = { id: crypto.randomUUID(), scannedAt: Date.now(), tabId: selected.id, scan,
      candidates: classifyLibraryBooks((await this.repository.read()).books, books) };
    // Session memory survives event-page suspension, but is not included in persistent data or backups.
    await browser.storage.session.set({ [LIBRARY_PREVIEW_KEY]: preview });
    return { status: 'scanned', tabs: [selected], preview };
  }

  async apply(scanId: string, keys: string[]): Promise<LibraryApplied> {
    const parsed = libraryPreviewSchema.safeParse((await browser.storage.session.get(LIBRARY_PREVIEW_KEY))[LIBRARY_PREVIEW_KEY]);
    if (!parsed.success || parsed.data.id !== scanId || parsed.data.scan.status !== 'ready') throw new Error('감지 결과가 없거나 새 감지 결과로 바뀌었습니다. 다시 감지하세요.');
    let applied: LibraryApplied | undefined;
    await this.repository.update(state => { applied = applyLibrarySelection(state, parsed.data, keys); });
    // A cleanup failure must not report a successfully committed book write as failed.
    await browser.storage.session.remove(LIBRARY_PREVIEW_KEY).catch(() => undefined);
    return applied!;
  }
}
