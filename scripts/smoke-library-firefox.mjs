import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = path.resolve('.tmp'); await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary; process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const profile = await mkdtemp(path.join(temporary, 'library-firefox-'));
const uuid = '00000000-0000-4000-8000-000000000002';
const base = `moz-extension://${uuid}/`;
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
  .addArguments('-headless', '-no-remote', '-profile', profile)
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'readchime@local.invalid': uuid }))
  .setPreference('intl.locale.requested', 'ko');
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(new firefox.ServiceBuilder(binary)).build();
const checks = [];
function checked(message) { checks.push(message); console.log(`확인: ${message}`); }
async function command(value) {
  const reply = await driver.executeAsyncScript('const done=arguments[arguments.length-1]; browser.runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:String(e)}));', value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
async function clickText(text) { await driver.findElement(By.xpath(`//button[normalize-space(.)='${text}']`)).click(); }
function card(key, title) { return `<div class="card ebook"><a class="card-link" href="https://play.google.com/books/reader?id=${key}"></a><a class="cover-link" href="https://play.google.com/books/reader?id=${key}"></a><div class="metadata"><a class="title" href="https://play.google.com/books/reader?id=${key}">${title}</a><a class="author">감지한 저자</a></div></div>`; }
const markup = `<gpb-library-home><a class="navbar-item your-books selected"></a><gpb-shelf-page><div class="header"><div class="page-controls"><button class="pagination-button" disabled>이전</button><button class="pagination-button">다음</button><button class="pagination-button pagination-toggle-button">모두 표시</button></div></div><div class="-gb-book-card-grid">${Array.from({ length: 97 }, (_, index) => card(`qa-new-${index}`, `새 책 ${index}`)).join('')}${card('qa-existing', 'Google에 표시된 기존 제목')}${card('qa-archived', 'Google에 표시된 제거한 책')}${card('qa-duplicate', '중복으로 등록된 책')}</div></gpb-shelf-page></gpb-library-home>`;
async function replaceBody(html, title) {
  await driver.executeScript(`const doc=new DOMParser().parseFromString(arguments[0],'text/html'); document.body.replaceChildren(...doc.body.childNodes); document.title=arguments[1]; document.body.dataset.qaPaginationClicks='0'; for(const button of document.querySelectorAll('.pagination-button')) button.addEventListener('click',()=>document.body.dataset.qaPaginationClicks=String(Number(document.body.dataset.qaPaginationClicks)+1));`, html, title);
}
try {
  await driver.manage().setTimeouts({ script: 20000, pageLoad: 30000 });
  await driver.installAddon(path.resolve('dist'), true); await driver.get(`${base}dashboard.html#library`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 15000); await driver.manage().window().setRect({ width: 1360, height: 1100 });
  await command({ type: 'SAVE_SETTINGS', settings: { ...(await command({ type: 'GET_STATE' })).snapshot.state.settings, language: 'ko' } });
  await driver.wait(async () => await driver.executeScript('return document.documentElement.lang') === 'ko', 5000);
  const dashboard = await driver.getWindowHandle();
  checked(`Firefox ${(await driver.getCapabilities()).get('browserVersion')}의 배포 확장 설치`);
  const now = new Date().toISOString();
  const makeBook = (key, title, more = {}) => ({ id: crypto.randomUUID(), title, author: '', url: key ? `https://play.google.com/books/reader?id=${key}` : '',
    notes: '보존할 사용자 메모', status: 'reading', createdAt: now, updatedAt: now, ...more });
  const existing = makeBook('qa-existing', '내가 정한 기존 제목');
  const archived = makeBook('qa-archived', '내가 숨긴 책', { author: '기존 저자', status: 'completed' });
  for (const book of [existing, archived, makeBook('qa-duplicate', '중복 A'), makeBook('qa-duplicate', '중복 B'), makeBook('', '새 책 0')]) await command({ type: 'SAVE_BOOK', book });
  await command({ type: 'SELECT_BOOK', id: existing.id });
  const originalSession = { id: crypto.randomUUID(), bookId: archived.id, bookTitle: archived.title, startedAt: now, endedAt: now, durationSeconds: 60,
    localDate: new Date().toLocaleDateString('en-CA'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'manual', measurement: 'entry', device: 'paper', notes: '보존할 기록', createdAt: now, updatedAt: now, interrupted: false, corrected: false };
  await command({ type: 'SAVE_SESSION', session: originalSession }); await command({ type: 'DELETE_BOOK', id: archived.id });
  const originalState = (await command({ type: 'GET_STATE' })).snapshot.state;
  await driver.switchTo().newWindow('tab'); await driver.get('https://play.google.com/books');
  const libraryWindow = await driver.getWindowHandle();
  assert.equal(new URL(await driver.getCurrentUrl()).pathname.replace(/\/$/, ''), '/books');
  // Synthetic metadata only; no account credentials, user's books, or book contents.
  await replaceBody(markup, '검증용 합성 서재 A');
  await driver.switchTo().newWindow('tab'); await driver.get('https://play.google.com/books');
  await replaceBody('<a href="https://accounts.google.com/ServiceLogin">로그인</a>', '검증용 로그인 필요 화면');
  await driver.switchTo().window(dashboard);
  await driver.sleep(5500);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.books.length, 5);
  assert.equal(await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.storage.session.get("readchime.libraryPreview").then(v=>done(Boolean(v["readchime.libraryPreview"])));'), false);
  checked('페이지 방문·독서 관측 주기에서 서재 미감지');
  await clickText('Play Books에서 가져오기');
  await driver.wait(until.elementLocated(By.css('.library-tab-list')), 5000);
  const buttons = await driver.findElements(By.xpath('//button[normalize-space(.)="이 탭에서 감지"]')); assert.equal(buttons.length, 2);
  await buttons[1].click();
  await driver.wait(until.elementLocated(By.xpath('//h3[normalize-space(.)="Google 로그인이 필요합니다"]')), 5000);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.books.length, 5);
  checked('여러 탭 선택과 로그인 필요 화면의 별도 안내');
  await clickText('서재 탭 다시 고르기'); await driver.wait(until.elementLocated(By.css('.library-tab-list')), 5000);
  await (await driver.findElements(By.xpath('//button[normalize-space(.)="이 탭에서 감지"]')))[0].click();
  await driver.wait(until.elementLocated(By.css('.library-candidates')), 5000);
  assert.match(await driver.findElement(By.css('[role="dialog"]')).getText(), /100권을 찾았습니다/);
  assert.match(await driver.findElement(By.css('[role="dialog"]')).getText(), /서재의 모든 책을 가져온다는 보장은 없습니다/);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.books.length, 5);
  assert.ok(await driver.executeScript('const button=[...document.querySelectorAll("[role=dialog] button")].find(button=>button.textContent.startsWith("선택한"));return button.getBoundingClientRect().bottom<=innerHeight;'));
  await writeFile(path.join(temporary, 'library-import-preview.png'), await driver.takeScreenshot(), 'base64');
  await driver.manage().window().setRect({ width: 500, height: 900 });
  assert.ok(await driver.executeScript('return document.documentElement.scrollWidth<=innerWidth+1;'));
  assert.ok(await driver.executeScript('const button=[...document.querySelectorAll("[role=dialog] button")].find(button=>button.textContent.startsWith("선택한"));return button.getBoundingClientRect().bottom<=innerHeight;'));
  await writeFile(path.join(temporary, 'library-import-narrow.png'), await driver.takeScreenshot(), 'base64');
  await driver.manage().window().setRect({ width: 1360, height: 1100 });
  checked('합성 서재 100권의 콘텐츠 스크립트 → 백그라운드 → 선택 미리보기, 확인 전 무저장');
  await clickText('신규 책 모두 선택');
  const filter = await driver.findElement(By.css('.library-import-filters select'));
  await filter.findElement(By.css('option[value="archived"]')).click();
  await driver.findElement(By.css('.library-candidates input[type="checkbox"]')).click();
  await filter.findElement(By.css('option[value="enrich"]')).click();
  await driver.findElement(By.css('.library-candidates input[type="checkbox"]')).click();
  await filter.findElement(By.css('option[value="duplicate"]')).click();
  assert.equal(await driver.findElement(By.css('.library-candidates input[type="checkbox"]')).isEnabled(), false);
  await clickText('선택한 99권 반영하기');
  await driver.wait(async () => (await driver.findElements(By.css('[role="dialog"]'))).length === 0, 8000);
  const result = (await command({ type: 'GET_STATE' })).snapshot.state;
  assert.equal(result.books.length, 102); assert.equal(result.settings.currentBookId, existing.id);
  assert.deepEqual(result.sessions, originalState.sessions);
  const updated = result.books.find(book => book.id === existing.id);
  assert.equal(updated.title, existing.title); assert.equal(updated.notes, existing.notes); assert.equal(updated.status, 'reading'); assert.equal(updated.author, '감지한 저자');
  const restored = result.books.find(book => book.id === archived.id);
  assert.equal(restored.archivedAt, undefined); assert.equal(restored.status, 'completed'); assert.equal(restored.author, '기존 저자');
  assert.equal(result.books.filter(book => book.url.endsWith('id=qa-duplicate')).length, 2);
  assert.equal(result.books.filter(book => book.title === '새 책 0').length, 2);
  assert.equal(result.books.filter(book => book.status === 'planned').length, 97);
  checked('신규 97권·명시 복원·빈 저자 보완·수동 책/중복/UUID/기록/현재 책 보존');
  await driver.switchTo().window(libraryWindow);
  assert.equal(await driver.executeScript('return document.body.dataset.qaPaginationClicks'), '0');
  await driver.switchTo().window(dashboard);
  await clickText('Play Books에서 가져오기'); await driver.wait(until.elementLocated(By.css('.library-tab-list')), 5000);
  await (await driver.findElements(By.xpath('//button[normalize-space(.)="이 탭에서 감지"]')))[0].click();
  await driver.wait(until.elementLocated(By.css('.library-candidates')), 5000);
  assert.match(await driver.findElement(By.css('[role="dialog"]')).getText(), /이미 등록됨 \(99\)/);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.books.length, 102);
  checked('다시 감지해도 추가 중복 없음, Google 페이지 버튼 자동 조작 없음');
  await writeFile(path.join(temporary, 'library-firefox-qa.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks,
    limitations: ['로그인한 실제 Google 계정의 현행 서재 DOM은 검증하지 않았습니다. 라이브 Google /books 탭의 본문을 합성 메타데이터로 교체해 확장 배선을 검증했습니다.'], profile }, null, 2));
} finally { await driver.quit(); }
