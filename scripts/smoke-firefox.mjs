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
// Firefox 158+ requires this for automation of privileged extension pages.
// It applies only to this isolated test process and its children.
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const profile = await mkdtemp(path.join(temporary, 'firefox-'));
const uuid = '00000000-0000-4000-8000-000000000001';
const base = `moz-extension://${uuid}/`;
const checks = [];
function checked(message) { checks.push(message); console.log(`확인: ${message}`); }
async function launch() {
  const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
    .addArguments('-headless', '-no-remote', '-profile', profile)
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'readchime@local.invalid': uuid }))
    .setPreference('intl.locale.requested', 'ko')
    .setPreference('browser.shell.checkDefaultBrowser', false);
  const logFile = openSync(path.join(temporary, 'geckodriver.log'), 'a');
  const service = new firefox.ServiceBuilder(binary).enableVerboseLogging(true).setStdio(['ignore', logFile, logFile]);
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  try {
    await driver.manage().setTimeouts({ script: 15000, pageLoad: 20000, implicit: 0 });
    await driver.installAddon(path.resolve('dist'), true);
    await driver.get(`${base}dashboard.html`);
    await driver.wait(until.elementLocated(By.css('.app-shell')), 15000);
    await driver.executeAsyncScript(`const done=arguments[arguments.length-1]; browser.runtime.sendMessage({type:'GET_STATE'}).then(reply => browser.runtime.sendMessage({type:'SAVE_SETTINGS', settings:{...reply.snapshot.state.settings, language:'ko'}})).then(done, error => done({ok:false,error:String(error)}));`);
    await driver.wait(async () => await driver.executeScript('return document.documentElement.lang') === 'ko', 5000);
    return driver;
  } catch (error) { await driver.quit(); throw error; }
}
let driver;
async function command(value) {
  const reply = await driver.executeAsyncScript(`const done = arguments[arguments.length-1]; browser.runtime.sendMessage(arguments[0]).then(done, error => done({ok:false,error:String(error)}));`, value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
async function clickText(text) { await driver.findElement(By.xpath(`//button[normalize-space(.)='${text}']`)).click(); }
async function setField(label, value) {
  const field = await driver.findElement(By.xpath(`//label[span[normalize-space(.)='${label}']]/input`));
  await field.clear(); await field.sendKeys(value);
}
try {
  console.log('별도 테스트 프로필에서 Firefox를 실행합니다.'); driver = await launch();
  checked(`Firefox ${(await driver.getCapabilities()).get('browserVersion')} 임시 확장 설치와 대시보드 로드`);
  let state = (await command({ type: 'GET_STATE' })).snapshot.state; assert.equal(state.sessions.length, 0); assert.equal(state.books.length, 0);
  checked('첫 실행의 빈 기록과 0분 표시');
  await driver.findElement(By.css('nav a[href="#library"]')).click(); await clickText('＋ 책 추가');
  await setField('책 제목', '검증용 책 · 실제 독서 아님'); await setField('저자 (선택)', '자동화 검증');
  await driver.findElement(By.css('[role="dialog"] textarea')).sendKeys('<img src=x onerror=alert(1)>');
  await driver.findElement(By.css('[role="dialog"] button.primary')).click();
  await driver.wait(async () => (await driver.findElements(By.css('[role="dialog"]'))).length === 0, 5000);
  state = (await command({ type: 'GET_STATE' })).snapshot.state; assert.equal(state.books.length, 1); const bookId = state.books[0].id;
  assert.equal((await driver.findElements(By.css('.book-note img'))).length, 0);
  checked('서재 UI 추가 및 메모 HTML의 텍스트 처리');
  await driver.findElement(By.css('nav a[href="#history"]')).click(); await clickText('＋ 독서 시간 직접 기록');
  await driver.findElement(By.css('[role="dialog"] input[type="checkbox"]')).click();
  await driver.findElement(By.css('[role="dialog"] button.primary')).click();
  await driver.wait(async () => (await command({ type: 'GET_STATE' })).snapshot.state.sessions.length === 1, 5000);
  state = (await command({ type: 'GET_STATE' })).snapshot.state; assert.equal(state.sessions[0].durationSeconds, 300); assert.equal(state.sessions[0].device, 'tablet');
  checked('태블릿 수동 기록 UI와 5분 저장');
  await driver.findElement(By.css('nav a[href="#stats"]')).click(); await driver.wait(until.elementLocated(By.css('.recharts-surface')), 5000);
  assert.equal((await driver.findElements(By.css('.heatmap .level-2'))).length, 1);
  await writeFile(path.join(temporary, 'stats-light.png'), await driver.takeScreenshot(), 'base64');
  checked('실제 저장 데이터의 차트와 목표 달성 달력');
  const exported = (await command({ type: 'EXPORT' })).json;
  let preview = await command({ type: 'PREVIEW_IMPORT', json: exported }); assert.equal(preview.preview.conflicts.length, 0); assert.equal(preview.preview.identical, 2);
  await command({ type: 'IMPORT', json: exported, mode: 'merge', useImportedIds: [], includeSettings: false, confirmed: true, expectedRevision: preview.snapshot.state.revision });
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.sessions.length, 1);
  const conflict = JSON.parse(exported); conflict.sessions[0].durationSeconds = 600;
  preview = await command({ type: 'PREVIEW_IMPORT', json: JSON.stringify(conflict) }); assert.equal(preview.preview.conflicts.length, 1);
  await command({ type: 'IMPORT', json: JSON.stringify(conflict), mode: 'merge', useImportedIds: [], includeSettings: false, confirmed: true, expectedRevision: preview.snapshot.state.revision });
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.sessions[0].durationSeconds, 300);
  preview = await command({ type: 'PREVIEW_IMPORT', json: exported });
  await command({ type: 'IMPORT', json: exported, mode: 'replace', useImportedIds: [], includeSettings: true, confirmed: true, expectedRevision: preview.snapshot.state.revision });
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.sessions[0].durationSeconds, 300);
  checked('실제 storage.local의 JSON 왕복·ID 중복 제거·충돌 보존');
  state = (await command({ type: 'GET_STATE' })).snapshot.state;
  const nextMinute = new Date(Date.now() + 60000);
  await command({ type: 'SAVE_SETTINGS', settings: { ...state.settings, hour: nextMinute.getHours(), minute: nextMinute.getMinutes(), goalMinutes: 20, theme: 'dark' } });
  const scheduled = (await command({ type: 'GET_STATE' })).snapshot.nextAlarm;
  assert.equal(new Date(scheduled).getHours(), nextMinute.getHours()); assert.equal(new Date(scheduled).getMinutes(), nextMinute.getMinutes());
  checked('실제 browser.alarms의 현지 시각 예약');
  console.log('예약한 시각에 실제 알람이 실행되는지 기다립니다 (최대 약 1분).');
  const targetDay = nextMinute.toLocaleDateString('en-CA');
  await driver.wait(async () => (await command({ type: 'GET_STATE' })).snapshot.state.reminder.days.includes(targetDay), 70000, '정기 알림이 실행되지 않았습니다.', 1000);
  assert.match(await driver.getCurrentUrl(), /dashboard\.html#library$/);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.reminder.days.filter(day => day === targetDay).length, 1);
  checked('예약 시각의 실제 정기 알람 실행·책 선택 화면 열기·당일 중복 처리 방지');
  await driver.wait(async () => await driver.executeScript('return document.documentElement.dataset.theme') === 'dark', 5000);
  await driver.findElement(By.css('nav a[href="#home"]')).click(); await driver.manage().window().setRect({ width: 1280, height: 900 });
  await writeFile(path.join(temporary, 'home-dark.png'), await driver.takeScreenshot(), 'base64');
  await driver.manage().window().setRect({ width: 500, height: 900 });
  assert.ok(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth + 1'));
  await writeFile(path.join(temporary, 'home-narrow.png'), await driver.takeScreenshot(), 'base64');
  await driver.get(`${base}popup.html`); await driver.wait(until.elementLocated(By.css('.popup')), 5000);
  assert.match(await driver.findElement(By.css('.popup-progress')).getText(), /5분/);
  await writeFile(path.join(temporary, 'popup-dark.png'), await driver.takeScreenshot(), 'base64');
  checked('다크 모드·좁은 화면·팝업 페이지의 저장 데이터 표시');
  await command({ type: 'DELETE_BOOK', id: bookId });
  state = (await command({ type: 'GET_STATE' })).snapshot.state; assert.equal(state.sessions.length, 1); assert.ok(state.books[0].archivedAt);
  checked('책 제거 후 독서 이력 보존');
  await driver.quit(); driver = undefined;
  driver = await launch(); state = (await command({ type: 'GET_STATE' })).snapshot.state;
  assert.equal(state.sessions.length, 1); assert.equal(state.sessions[0].durationSeconds, 300); assert.ok(state.books[0].archivedAt);
  checked('Firefox 종료·동일 임시 확장 재설치 후 데이터 보존 (상시 설치 검증과 구분)');
  await writeFile(path.join(temporary, 'firefox-qa.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, profile, limitations: ['실제 Google Play Books 로그인 리더와 실제 OS 알림 클릭은 검증하지 않았습니다.', '서명된 상시 설치와 정상 설치의 제거 동작은 검증하지 않았습니다.'] }, null, 2));
} finally { if (driver) await driver.quit(); }
