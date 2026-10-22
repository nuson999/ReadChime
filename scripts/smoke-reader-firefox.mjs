import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = path.resolve('.tmp');
await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const profile = await mkdtemp(path.join(temporary, 'reader-firefox-'));
const uuid = '00000000-0000-4000-8000-000000000003';
const base = `moz-extension://${uuid}/`;
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
  .addArguments('-headless', '-no-remote', '-profile', profile)
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'readchime@local.invalid': uuid }))
  .setPreference('intl.locale.requested', 'ko');
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const service = new firefox.ServiceBuilder(binary).enableVerboseLogging(true)
  .setStdio(['ignore', openSync(path.join(temporary, 'reader-geckodriver.log'), 'a'), openSync(path.join(temporary, 'reader-geckodriver.log'), 'a')]);
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
const checks = [];
function checked(value) { checks.push(value); console.log(`확인: ${value}`); }
async function command(value) {
  const reply = await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:String(e)}));', value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
let dashboard;
let reader;
async function state() { await driver.switchTo().window(dashboard); return (await command({ type: 'GET_STATE' })).snapshot.state; }
async function page(key, title) {
  await driver.switchTo().window(reader);
  // Reproduce only outer reader structure and metadata on the allowed live origin.
  // No account, book body, authentication, or hidden Google API is used.
  await driver.executeScript(`history.replaceState({}, '', '/books/reader?id='+encodeURIComponent(arguments[0])+'&pg=9');document.title=arguments[1]+' - Google Play Books';const doc=new DOMParser().parseFromString('<reader-control></reader-control><iframe class="-gb-display"></iframe>', 'text/html');document.body.replaceChildren(...doc.body.childNodes);`, key, title);
}
async function prompt() {
  await driver.wait(until.elementLocated(By.id('readchime-reader-prompt')), 10000);
  return (await driver.findElement(By.id('readchime-reader-prompt'))).getShadowRoot();
}
try {
  await driver.manage().setTimeouts({ script: 20000, pageLoad: 30000 });
  await driver.installAddon(path.resolve('dist'), true);
  await driver.get(`${base}dashboard.html`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 15000);
  dashboard = await driver.getWindowHandle();
  const initial = await state();
  await command({ type: 'SAVE_SETTINGS', settings: { ...initial.settings, language: 'ko', autoStart: true, reminderEnabled: false } });
  // Deliberately emulate Firefox versions that reject programmatic toolbar popups.
  // Exercise the real content-script fallback and trusted button click end to end.
  const patched = await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.runtime.getBackgroundPage().then(bg=>{bg.qaOriginalOpenPopup=bg.browser.action.openPopup.bind(bg.browser.action);bg.browser.action.openPopup=()=>Promise.reject(new Error('QA: popup unavailable'));done(true);},e=>done(String(e)));`);
  assert.equal(patched, true);
  const now = new Date().toISOString();
  const saved = { id: crypto.randomUUID(), title: '등록해 둔 책', author: '등록해 둔 저자', url: 'https://play.google.com/books/reader?id=qa-saved', status: 'reading', notes: '보존할 메모', createdAt: now, updatedAt: now };
  const previous = { ...saved, id: crypto.randomUUID(), title: '예전 추천 책', url: 'https://play.google.com/books/reader?id=qa-previous' };
  await command({ type: 'SAVE_BOOK', book: saved }); await command({ type: 'SAVE_BOOK', book: previous });
  await command({ type: 'SELECT_BOOK', id: previous.id });
  await driver.switchTo().newWindow('tab'); await driver.get('https://play.google.com/books'); reader = await driver.getWindowHandle();
  await page('qa-saved', '화면의 다른 제목');
  let panel = await prompt();
  assert.equal(await (await panel.findElement(By.css('h2'))).getText(), saved.title);
  await writeFile(path.join(temporary, 'reader-prompt.png'), await driver.takeScreenshot(), 'base64');
  let current = await state(); assert.equal(current.settings.currentBookId, saved.id); assert.equal(current.books.length, 2); assert.equal(current.active, null); assert.equal(current.sessions.length, 0);
  checked('등록 URL의 ID 대조, 기존 제목·저자 보존, 클릭 전 기록 없음');
  // Open the popup page as a normal extension tab to inspect the selected book.
  await driver.switchTo().newWindow('tab'); const popup = await driver.getWindowHandle(); await driver.get(`${base}popup.html`);
  await driver.wait(until.elementLocated(By.css('.timer-card h3')), 8000);
  assert.equal(await driver.findElement(By.css('.timer-card h3')).getText(), saved.title);
  await driver.close(); await driver.switchTo().window(reader);
  panel = await prompt(); await (await panel.findElement(By.css('button.primary'))).click();
  await driver.wait(async () => (await driver.findElements(By.id('readchime-reader-prompt'))).length === 0, 5000);
  await driver.sleep(11000);
  current = await state(); assert.equal(current.active.bookId, saved.id);
  const seconds = current.active.buckets.reduce((total, bucket) => total + bucket.seconds, 0); assert.ok(seconds >= 4 && seconds <= 12, String(seconds));
  await driver.sleep(6000); current = await state(); assert.equal(current.active.buckets.reduce((total, bucket) => total + bucket.seconds, 0), seconds);
  assert.equal(current.active.status, 'paused');
  const sessionId = current.active.id;
  checked('실제 시작 버튼 클릭 후 측정, 숨김 5초 초과 시 일시정지·숨김 시간 제외');
  await driver.switchTo().window(reader); panel = await prompt();
  assert.equal(await (await panel.findElement(By.css('button.primary'))).getText(), '▶ 읽기 재개');
  await writeFile(path.join(temporary, 'reader-resume-card.png'), await driver.takeScreenshot(), 'base64');
  await (await panel.findElement(By.css('header button'))).click();
  assert.equal(await (await panel.findElement(By.css('section'))).getAttribute('class'), 'compact');
  await driver.sleep(5500); panel = await prompt();
  assert.equal(await (await panel.findElement(By.css('section'))).getAttribute('class'), 'compact');
  await writeFile(path.join(temporary, 'reader-resume-compact.png'), await driver.takeScreenshot(), 'base64');
  await (await panel.findElement(By.css('button.primary'))).click();
  await driver.wait(async () => (await driver.findElements(By.id('readchime-reader-prompt'))).length === 0, 5000);
  await driver.sleep(5500);
  current = await state(); assert.equal(current.active.id, sessionId); assert.equal(current.active.status, 'waiting');
  await driver.switchTo().window(reader); await driver.sleep(1200);
  assert.equal((await driver.findElements(By.id('readchime-reader-prompt'))).length, 0);
  current = await state(); assert.equal(current.active.id, sessionId); assert.notEqual(current.active.status, 'paused');
  checked('오른쪽 위 재개 카드·접힌 버튼 유지·실제 클릭 재개·5초 이내 전환 자동 복귀');
  const beforeNotes = current.active.buckets.reduce((total, bucket) => total + bucket.seconds, 0);
  await driver.switchTo().window(reader);
  await driver.manage().window().setRect({ x: 0, y: 0, width: 700, height: 750 });
  await driver.switchTo().newWindow('window'); const notes = await driver.getWindowHandle();
  await driver.get(`${base}dashboard.html#stats`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 10000);
  await driver.manage().window().setRect({ x: 720, y: 0, width: 500, height: 750 });
  const bookWindow = await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.windows.get(arguments[0]).then(done);', current.active.windowId);
  assert.equal(bookWindow.focused, false); assert.notEqual(bookWindow.state, 'minimized');
  await driver.sleep(16500);
  current = await state();
  assert.equal(current.active.id, sessionId); assert.notEqual(current.active.status, 'paused');
  const afterNotes = current.active.buckets.reduce((total, bucket) => total + bucket.seconds, 0);
  assert.ok(afterNotes >= beforeNotes + 10, `unfocused visible window: ${beforeNotes} -> ${afterNotes}`);
  await driver.switchTo().window(notes); await driver.close(); await driver.switchTo().window(reader);
  current = await state();
  checked('보이는 책 창이 포커스를 잃어도 16초 이상 계속 측정·다른 창의 일반 탭이 세션을 변경하지 않음');
  await command({ type: 'SAVE_SETTINGS', settings: { ...current.settings, readerPrompt: false } });
  await command({ type: 'PAUSE' });
  await driver.switchTo().window(reader); panel = await prompt();
  assert.equal(await (await panel.findElement(By.css('button.primary'))).getText(), '▶ 읽기 재개');
  await (await panel.findElement(By.css('button.primary'))).click();
  await driver.wait(async () => (await driver.findElements(By.id('readchime-reader-prompt'))).length === 0, 5000);
  current = await state(); assert.equal(current.active.id, sessionId); assert.notEqual(current.active.status, 'paused');
  await command({ type: 'SAVE_SETTINGS', settings: { ...current.settings, readerPrompt: true } });
  checked('시작 안내를 꺼도 직접 일시정지한 독서를 페이지 버튼으로 재개');
  await page('qa-second', '새로 연 책'); panel = await prompt();
  assert.equal(await (await panel.findElement(By.css('h2'))).getText(), '새로 연 책');
  current = await state(); assert.equal(current.active, null); assert.equal(current.sessions.length, 1); assert.equal(current.sessions[0].bookId, saved.id);
  const second = current.books.find(book => book.id === current.settings.currentBookId); assert.equal(second.title, '새로 연 책'); assert.equal(current.books.length, 3);
  checked('다른 책으로 이동하면 이전 시간 저장, 새 책 자동 등록·선택, 시작 입력 대기');
  await driver.switchTo().window(reader); panel = await prompt(); await (await panel.findElement(By.css('button.primary'))).click();
  await driver.sleep(6000); current = await state(); assert.equal(current.active.bookId, second.id);
  await command({ type: 'STOP' });
  await driver.switchTo().window(reader); await driver.sleep(5500);
  assert.equal((await driver.findElements(By.id('readchime-reader-prompt'))).length, 0);
  current = await state(); assert.equal(current.active, null);
  checked('종료 후 같은 읽기 화면에서는 자동 재시작·안내 반복 없음');
  // Restore the real toolbar API and inspect its actual popup document from the
  // same extension context after it finishes loading, without starting a timer.
  await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.runtime.getBackgroundPage().then(bg=>{bg.browser.action.openPopup=async options=>{await bg.qaOriginalOpenPopup(options);const capture=attempt=>{const popup=bg.browser.extension.getViews({type:'popup'})[0];const title=popup?.document.querySelector('.timer-card h3')?.textContent;if(title)bg.browser.storage.session.set({'qa-native-popup':{title,button:popup.document.querySelector('.timer-card button.primary')?.textContent}});else if(attempt<30)bg.setTimeout(()=>capture(attempt+1),100);};bg.setTimeout(()=>capture(0),100);};done(true);},e=>done(String(e)));`);
  await page('qa-native', '도구 모음 팝업 검증 책');
  await driver.sleep(3500);
  current = await state(); assert.equal(current.active, null);
  const native = await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.storage.session.get('qa-native-popup').then(value=>done(value['qa-native-popup']));`);
  assert.equal(native?.title, '도구 모음 팝업 검증 책'); assert.equal(native?.button, '▶ 독서 시작');
  checked('실제 Firefox 도구 모음 팝업 자동 열기·현재 책 표시·시작 버튼과 클릭 전 대기');
  await writeFile(path.join(temporary, 'reader-firefox-qa.json'), JSON.stringify({ checkedAt: new Date().toISOString(), browserVersion: (await driver.getCapabilities()).get('browserVersion'), checks,
    limitations: ['로그인한 실제 책 DOM은 검증하지 않았습니다. 허용된 Google origin에서 리더 바깥 구조·제목만 합성했습니다.', '페이지 내 팝업 경로는 도구 모음 API를 테스트에서 실패시켜 검증하고, 마지막에는 실제 도구 모음 API와 팝업 문서도 확인했습니다.'], profile, popup }, null, 2));
} catch (error) {
  console.log('Reader failure:', String(error));
  console.log('Page evidence:', await driver.executeScript('return {url:location.href,title:document.title,visible:document.visibilityState,control:!!document.querySelector("reader-control"),frame:!!document.querySelector("iframe.-gb-display"),prompt:!!document.getElementById("readchime-reader-prompt")};'));
  if (dashboard) {
    await driver.switchTo().window(dashboard);
    console.log('Extension evidence:', JSON.stringify(await driver.executeAsyncScript(`const done=arguments[arguments.length-1];Promise.all([browser.tabs.query({}).then(tabs=>tabs.map(({id,url,active})=>({id,url,active}))),browser.windows.getAll(),browser.storage.session.get(),browser.runtime.sendMessage({type:'GET_STATE'})]).then(done,e=>done(String(e)));`)));
  }
  throw error;
} finally { await driver.quit(); }
