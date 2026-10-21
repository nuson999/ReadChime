import { playBooksDetector } from '../domain/detector';
import type { Heartbeat } from '../shared/messages';
import { scanLibraryPage } from '../domain/library';
import type { Runtime } from 'webextension-polyfill';

const token = crypto.randomUUID();
function evidence(): Heartbeat {
  return { type: 'HEARTBEAT', detection: playBooksDetector.detect(location.href, document), visible: document.visibilityState === 'visible',
    mono: performance.now(), token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
function send() { void browser.runtime.sendMessage(evidence()).catch(() => undefined); }
browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  if (message && typeof message === 'object' && 'type' in message && message.type === 'SCAN_LIBRARY') return Promise.resolve(scanLibraryPage(location.href, document));
  if (message && typeof message === 'object' && 'type' in message && message.type === 'GET_EVIDENCE') return Promise.resolve(evidence());
  return undefined;
});
document.addEventListener('visibilitychange', send);
window.addEventListener('pageshow', send);
window.addEventListener('pagehide', send);
window.addEventListener('focus', send);
window.addEventListener('blur', send);
// Heartbeats originate in the page; an event-page interval is never the clock.
setInterval(send, 5000);
send();
