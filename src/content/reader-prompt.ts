import type { ReaderOffer, ReaderReply } from '../shared/messages';
import { resolveLanguage, translate } from '../i18n';
import { readerKey } from '../domain/books';

let host: HTMLElement | undefined;
let displayedKey: string | undefined;
let collapsedSessionId: string | undefined;
let title: HTMLElement;
let author: HTMLElement;
let button: HTMLButtonElement;
let confirmation: HTMLLabelElement;
let checkbox: HTMLInputElement;
let error: HTMLElement;

export function showReaderOffer(offer?: ReaderOffer) {
  const paused = !!(offer?.started && offer.paused && offer.sessionId);
  if (!offer || offer.key !== readerKey(location.href) || (!paused && (offer.started || !offer.showPrompt))) { host?.remove(); host = undefined; displayedKey = undefined; return; }
  const t = (message: string) => translate(message, [], resolveLanguage(offer.language));
  const identity = `${offer.key}:${paused ? offer.sessionId : 'start'}:${resolveLanguage(offer.language)}`;
  if (displayedKey !== identity) { host?.remove(); host = undefined; }
  if (!host) {
    host = document.createElement('div');
    host.id = 'readchime-reader-prompt';
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;max-width:calc(100vw - 40px)';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;font:14px/1.5 system-ui,sans-serif;color:#20382f}section{box-sizing:border-box;width:350px;max-width:calc(100vw - 40px);padding:22px;border:1px solid #cbd9cd;border-radius:18px;background:#fcfcf7;box-shadow:0 10px 40px #132a2340}header{display:flex;align-items:center;justify-content:space-between}h2{font-size:20px;line-height:1.35;margin:14px 0 4px;overflow-wrap:anywhere}p{margin:8px 0;color:#53665b;overflow-wrap:anywhere}button{font:inherit;cursor:pointer;border:0;border-radius:9px;padding:10px 15px;background:#e8eee7;color:#20382f}button.primary{width:100%;background:#295a43;color:white;margin-top:12px}button:focus-visible,input:focus-visible{outline:3px solid #ba8734;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}label{display:block;margin:12px 0}input{margin-right:7px}[hidden]{display:none!important}[role=alert]{color:#a3332d}';
    style.textContent += 'section.compact{width:auto;padding:8px;border-radius:12px}section.compact>header,section.compact>h2,section.compact>p:not([role=alert]){display:none}section.compact button.primary{width:auto;margin:0}';
    const panel = document.createElement('section'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t(paused ? '독서 일시정지' : '독서를 시작할까요?'));
    if (paused && collapsedSessionId === offer.sessionId) panel.className = 'compact';
    const header = document.createElement('header');
    const brand = document.createElement('strong'); brand.textContent = 'ReadChime';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = paused ? '−' : '×'; close.setAttribute('aria-label', t(paused ? '안내 접기' : '닫기'));
    header.append(brand, close);
    title = document.createElement('h2'); author = document.createElement('p');
    const help = document.createElement('p'); help.textContent = t(paused ? '독서가 일시정지되었습니다. 준비되면 읽기를 재개하세요.' : '책을 감지했습니다. 시작 버튼을 누른 뒤부터 독서 시간을 기록합니다.');
    confirmation = document.createElement('label'); checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    confirmation.append(checkbox, document.createTextNode(t('이 탭에서 실제로 읽고 있습니다 ')));
    error = document.createElement('p'); error.setAttribute('role', 'alert'); error.hidden = true;
    button = document.createElement('button'); button.type = 'button'; button.className = 'primary';
    const key = offer.key;
    close.addEventListener('click', event => {
      if (!event.isTrusted) return;
      if (paused) {
        collapsedSessionId = offer.sessionId; panel.className = 'compact'; button.textContent = t('▶ 읽기 재개');
        button.focus();
        return;
      }
      void browser.runtime.sendMessage({ type: 'READER_DISMISS', key }).catch(() => undefined);
      host?.remove(); host = undefined; displayedKey = undefined;
    });
    button.addEventListener('click', event => {
      // A website's synthetic click must not start recording on the user's behalf.
      if (!event.isTrusted || key !== readerKey(location.href)) return;
      button.disabled = true; error.hidden = true;
      void browser.runtime.sendMessage({ type: paused ? 'READER_RESUME' : 'READER_START', key, confirm: checkbox.checked, ...(paused ? { sessionId: offer.sessionId } : {}) }).then(value => {
        const reply = value as ReaderReply | undefined;
        if (!reply?.ok) throw new Error(reply?.error ?? t('처리하지 못했습니다. 다시 시도하세요.'));
        host?.remove(); host = undefined; displayedKey = undefined; collapsedSessionId = undefined;
      }).catch(cause => { error.textContent = cause instanceof Error ? translate(cause.message, [], resolveLanguage(offer.language)) : String(cause); error.hidden = false; button.disabled = false; });
    });
    panel.append(header, title, author, help, confirmation, error, button);
    shadow.append(style, panel); document.documentElement.append(host); displayedKey = identity;
  }
  title.textContent = offer.pendingTitle ? `${t('제목 확인 중')} · ${offer.key}` : offer.title;
  author.textContent = offer.author;
  confirmation.hidden = offer.supported;
  button.textContent = t(paused ? '▶ 읽기 재개' : offer.restore ? '읽기 재개' : '▶ 독서 시작');
}
