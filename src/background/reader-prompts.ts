import { readerKey } from '../domain/books';

const KEY = 'readchime.readerPrompts';
type Visit = { key: string; mode: 'toolbar' | 'page' | 'dismissed' | 'removed' };

// Session storage survives event-page suspension, but never restores stale tab IDs
// from an exported backup or a previous browser session.
export class ReaderPrompts {
  private visits: Record<string, Visit> = {};
  private loaded = false;
  private async load() {
    if (!this.loaded) {
      this.visits = ((await browser.storage.session.get(KEY))[KEY] ?? {}) as Record<string, Visit>;
      this.loaded = true;
    }
  }
  private async save() { await browser.storage.session.set({ [KEY]: this.visits }); }
  async offer(tabId: number, key: string, windowId: number | undefined): Promise<boolean> {
    await this.load();
    const existing = this.visits[tabId];
    if (existing?.key === key) return existing.mode === 'page';
    this.visits[tabId] = { key, mode: 'toolbar' };
    await this.save();
    try { await browser.action.openPopup({ windowId }); return false; }
    catch {
      this.visits[tabId].mode = 'page';
      await this.save();
      return true;
    }
  }
  async dismiss(tabId: number, key: string) {
    await this.load();
    this.visits[tabId] = { key, mode: 'dismissed' };
    await this.save();
  }
  async ignored(tabId: number, key: string) { await this.load(); return this.visits[tabId]?.key === key && this.visits[tabId].mode === 'removed'; }
  async ignore(tabId: number, key: string) { await this.load(); this.visits[tabId] = { key, mode: 'removed' }; await this.save(); }
  async navigate(tabId: number, url: string) {
    await this.load();
    if (this.visits[tabId]?.key !== readerKey(url)) await this.remove(tabId);
  }
  async remove(tabId: number) {
    await this.load();
    delete this.visits[tabId];
    await this.save();
  }
  async reset() { this.visits = {}; this.loaded = true; await this.save(); }
}
