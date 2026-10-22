import { playBooksDetector } from '../domain/detector';
import type { Heartbeat, ReaderReply } from '../shared/messages';
import { scanLibraryPage } from '../domain/library';
import type { Runtime } from 'webextension-polyfill';
import { showReaderOffer } from './reader-prompt';
import { readerKey } from '../domain/books';

const token = crypto.randomUUID();
function evidence(): Heartbeat {
  return { type: 'HEARTBEAT', detection: playBooksDetector.detect(location.href, document), visible: document.visibilityState === 'visible',
    mono: performance.now(), token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
let detectionSignature = '';
function send() {
  const observation = evidence(); detectionSignature = JSON.stringify(observation.detection);
  void browser.runtime.sendMessage(observation).then(value => {
    const reply = value as ReaderReply | undefined;
    if (reply?.ok && observation.detection.key === readerKey(location.href)) showReaderOffer(reply.reader);
  }).catch(() => undefined);
}
browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  if (message && typeof message === 'object' && 'type' in message && message.type === 'READER_STATE' && 'reply' in message) {
    const reply = message.reply as ReaderReply | undefined;
    if (reply?.ok) showReaderOffer(reply.reader);
    return undefined;
  }
  if (message && typeof message === 'object' && 'type' in message && message.type === 'SCAN_LIBRARY') return Promise.resolve(scanLibraryPage(location.href, document));
  if (message && typeof message === 'object' && 'type' in message && message.type === 'GET_EVIDENCE') return Promise.resolve(evidence());
  return undefined;
});
document.addEventListener('visibilitychange', send);
window.addEventListener('pageshow', send);
window.addEventListener('pagehide', send);
window.addEventListener('focus', send);
window.addEventListener('blur', send);
window.addEventListener('popstate', send);
// Detect the reader and its title as soon as the page finishes rendering.
let pending: ReturnType<typeof setTimeout> | undefined;
new MutationObserver(() => {
  if (pending) return;
  pending = setTimeout(() => {
    pending = undefined;
    if (JSON.stringify(playBooksDetector.detect(location.href, document)) !== detectionSignature) send();
  }, 150);
}).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['content'] });
// Heartbeats originate in the page; an event-page interval is never the clock.
setInterval(send, 5000);
send();
