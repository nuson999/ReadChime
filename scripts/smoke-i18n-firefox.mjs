import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = path.resolve('.tmp');
await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const profile = await mkdtemp(path.join(temporary, 'i18n-firefox-'));
const uuid = '00000000-0000-4000-8000-000000000003';
const base = `moz-extension://${uuid}/`;
const checks = [];
let driver;
const checked = message => { checks.push(message); console.log(`Checked: ${message}`); };
async function command(value) {
  const reply = await driver.executeAsyncScript('const done=arguments[arguments.length-1]; browser.runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:String(e)}));', value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
async function launch() {
  const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
    .addArguments('-headless', '-no-remote', '-profile', profile)
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'readchime@local.invalid': uuid }))
    .setPreference('intl.locale.requested', 'en-US')
    .setPreference('browser.shell.checkDefaultBrowser', false);
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(new firefox.ServiceBuilder(binary)).build();
  await driver.manage().setTimeouts({ script: 15000, pageLoad: 20000, implicit: 0 });
  await driver.manage().window().setRect({ width: 1360, height: 1100 });
  await driver.installAddon(path.resolve('dist'), true);
  await driver.get(`${base}dashboard.html`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 15000);
}
async function waitLanguage(language) {
  await driver.wait(async () => await driver.executeScript('return document.documentElement.lang') === language, 6000);
}
async function settingsLanguage(language) {
  await driver.findElement(By.css('nav a[href="#settings"]')).click();
  await driver.wait(until.elementLocated(By.css('select[name="language"]')), 5000);
  await driver.findElement(By.css(`select[name="language"] option[value="${language}"]`)).click();
  await driver.findElement(By.css('form button.primary')).click();
  await waitLanguage(language);
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.settings.language, language);
}
async function englishCopy() {
  const text = await driver.findElement(By.css('body')).getText();
  const clean = text.replaceAll('보존할 한국어 책 {0}', '').replaceAll('보존할 저자', '').replaceAll('보존할 메모', '')
    .replaceAll('한국어', '').replaceAll('언어', '');
  assert.equal(/[가-힣]/.test(clean), false, `Untranslated English UI: ${clean}`);
  assert.equal((await driver.findElements(By.css('.book-note img, .record-notes img'))).length, 0);
}
try {
  await launch();
  checked(`Firefox ${(await driver.getCapabilities()).get('browserVersion')} isolated extension installation`);
  const system = await driver.executeScript('return browser.i18n.getUILanguage()');
  await waitLanguage(/^ko(?:[-_]|$)/i.test(system) ? 'ko' : 'en');
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.settings.language, 'system');
  const manifestName = await driver.executeScript('return browser.runtime.getManifest().name');
  assert.equal(manifestName, /^ko(?:[-_]|$)/i.test(system) ? 'ReadChime · 하루 한 페이지' : 'ReadChime · One page a day');
  checked('System default and native manifest metadata follow the Firefox UI language');
  await settingsLanguage('en');
  const now = new Date().toISOString();
  const book = { id: crypto.randomUUID(), title: '보존할 한국어 책 {0}', author: '보존할 저자', notes: '보존할 메모', url: '', status: 'reading', createdAt: now, updatedAt: now };
  await command({ type: 'SAVE_BOOK', book });
  const day = await driver.executeScript(`const p=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(t=>p.find(x=>x.type===t).value).join('-')`);
  await command({ type: 'SAVE_SESSION', session: { id: crypto.randomUUID(), bookId: book.id, bookTitle: book.title, startedAt: now, endedAt: now, durationSeconds: 120, source: 'manual', measurement: 'entry', device: 'paper', notes: '보존할 메모', localDate: day, timezone: 'Asia/Seoul', createdAt: now, updatedAt: now, interrupted: false, corrected: false } });
  for (const section of ['home', 'stats', 'library', 'history', 'settings']) {
    await driver.findElement(By.css(`nav a[href="#${section}"]`)).click();
    await englishCopy();
  }
  assert.equal(await driver.getTitle(), 'ReadChime · Reading dashboard');
  await writeFile(path.join(temporary, 'i18n-en-settings.png'), await driver.takeScreenshot(), 'base64');
  checked('All five dashboard sections render English while preserving Korean book content');
  await driver.findElement(By.css('nav a[href="#library"]')).click();
  await driver.findElement(By.css('.page-intro button.primary')).click();
  await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 5000);
  assert.equal(await driver.findElement(By.css('[role="dialog"] h2')).getText(), 'Add a book to your library');
  assert.equal(await driver.findElement(By.css('[role="dialog"] button.icon-button')).getAttribute('aria-label'), 'Close');
  await englishCopy();
  await driver.findElement(By.css('[role="dialog"] button.icon-button')).click();
  await driver.findElement(By.css('nav a[href="#history"]')).click();
  await driver.findElement(By.css('.page-intro button.primary')).click();
  await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 5000);
  await englishCopy();
  await driver.findElement(By.css('[role="dialog"] button.icon-button')).click();
  checked('Book/session dialogs, option labels, and accessible close labels use English');
  const dashboard = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  await driver.get(`${base}popup.html`);
  const popup = await driver.getWindowHandle();
  await driver.wait(until.elementLocated(By.css('.popup')), 10000);
  await waitLanguage('en'); await englishCopy();
  await driver.switchTo().window(dashboard);
  await settingsLanguage('ko');
  assert.equal(await driver.findElement(By.css('.page-intro h1')).getText(), '설정');
  assert.equal(await driver.getTitle(), 'ReadChime · 독서 대시보드');
  await writeFile(path.join(temporary, 'i18n-ko-settings.png'), await driver.takeScreenshot(), 'base64');
  await driver.switchTo().window(popup); await waitLanguage('ko');
  assert.equal(await driver.findElement(By.css('.popup-header button')).getText(), '대시보드 ↗');
  checked('Saving Korean updates the open dashboard and popup, including document language/title');
  await driver.switchTo().window(dashboard);
  const before = (await command({ type: 'GET_STATE' })).snapshot.state;
  const exported = (await command({ type: 'EXPORT' })).json;
  assert.equal(JSON.parse(exported).settings.language, 'ko');
  const legacy = JSON.parse(exported); delete legacy.settings.language;
  const preview = await command({ type: 'PREVIEW_IMPORT', json: JSON.stringify(legacy) });
  await command({ type: 'IMPORT', json: JSON.stringify(legacy), mode: 'merge', useImportedIds: [], includeSettings: false, confirmed: true, expectedRevision: preview.snapshot.state.revision });
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.settings.language, 'ko');
  await driver.quit(); driver = undefined;
  await launch(); await waitLanguage('ko');
  const after = (await command({ type: 'GET_STATE' })).snapshot.state;
  assert.deepEqual(after.books, before.books); assert.deepEqual(after.sessions, before.sessions);
  assert.equal(after.settings.language, 'ko');
  checked('Language persists across restart, round-trips in JSON, and legacy merge preserves current settings/content');
  await settingsLanguage('en');
  const settings = (await command({ type: 'GET_STATE' })).snapshot.state.settings;
  await command({ type: 'SAVE_SETTINGS', settings: { ...settings, reminderEnabled: false } });
  await driver.executeScript(`location.hash='home'`);
  await driver.wait(until.elementLocated(By.css('.reminder-actions button')), 5000);
  await driver.findElement(By.css('.reminder-actions button')).click();
  await driver.wait(until.elementLocated(By.css('[role="alert"]')), 5000);
  assert.match(await driver.findElement(By.css('[role="alert"]')).getText(), /Enable reminders in Settings first/);
  checked('Background validation errors appear in the selected UI language');
  await writeFile(path.join(temporary, 'i18n-firefox-qa.json'), JSON.stringify({ checkedAt: new Date().toISOString(), browserLanguage: system, manifestName, checks, limitations: ['Notifications use mocked API integration tests; real OS notification clicks were not tested.', 'No authenticated Play Books account was used.'] }, null, 2));
} finally { if (driver) await driver.quit(); }
