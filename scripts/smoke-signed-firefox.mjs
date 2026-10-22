import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = path.resolve('.tmp');
await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const xpi = path.resolve(process.argv[2] ?? `artifacts/readchime-${manifest.version}-signed.xpi`);
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const profile = await mkdtemp(path.join(temporary, 'signed-firefox-'));
const uuid = '00000000-0000-4000-8000-000000000004';
const base = `moz-extension://${uuid}/`;
const checks = [];
let driver;
function checked(value) { checks.push(value); console.log(`확인: ${value}`); }
async function launch() {
  const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
    .addArguments('-headless', '-no-remote', '-profile', profile)
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: uuid }))
    .setPreference('intl.locale.requested', 'ko')
    .setPreference('browser.shell.checkDefaultBrowser', false);
  const log = openSync(path.join(temporary, 'signed-geckodriver.log'), 'a');
  const service = new firefox.ServiceBuilder(binary).setStdio(['ignore', log, log]);
  return new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
}
async function command(value) {
  const reply = await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:String(e)}));', value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
async function openDashboard() {
  await driver.get(`${base}dashboard.html`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 15000);
  assert.equal(await driver.executeScript('return browser.runtime.getManifest().version'), manifest.version);
}
try {
  driver = await launch();
  await driver.manage().setTimeouts({ script: 20000, pageLoad: 30000 });
  // Reproduce the user's current temporary installation and preserve its data
  // while installing the signed copy, without uninstalling the temporary add-on.
  await driver.installAddon(path.resolve('dist'), true);
  await openDashboard();
  const initial = (await command({ type: 'GET_STATE' })).snapshot.state;
  await command({ type: 'SAVE_SETTINGS', settings: { ...initial.settings, reminderEnabled: false, language: 'ko' } });
  const now = new Date().toISOString();
  const book = { id: crypto.randomUUID(), title: '서명본 재시작 검증 · 합성 기록', author: '', url: '', notes: '별도 테스트 프로필', status: 'planned', createdAt: now, updatedAt: now };
  await command({ type: 'SAVE_BOOK', book });
  // false is a normal permanent install; signature enforcement remains enabled.
  assert.equal(await driver.installAddon(xpi, false), manifest.browser_specific_settings.gecko.id);
  await openDashboard();
  assert.equal((await command({ type: 'GET_STATE' })).snapshot.state.books.find(value => value.id === book.id)?.title, book.title);
  checked('임시 확장을 제거하지 않고 서명본을 일반 설치한 뒤 기존 데이터 보존');
  const browserVersion = (await driver.getCapabilities()).get('browserVersion');
  await driver.quit(); driver = undefined;
  const installed = JSON.parse(await readFile(path.join(profile, 'extensions.json'), 'utf8')).addons.find(addon => addon.id === manifest.browser_specific_settings.gecko.id);
  assert.ok(installed); assert.equal(installed.version, manifest.version); assert.equal(installed.active, true); assert.equal(installed.location, 'app-profile');
  checked('Firefox 프로필에 일반 확장으로 저장된 상태 확인');
  driver = await launch();
  await driver.manage().setTimeouts({ script: 20000, pageLoad: 30000 });
  // Deliberately do not call installAddon on this second launch.
  await openDashboard();
  const restored = (await command({ type: 'GET_STATE' })).snapshot.state;
  assert.equal(restored.books.find(value => value.id === book.id)?.title, book.title);
  assert.equal(restored.settings.reminderEnabled, false); assert.equal(restored.settings.language, 'ko');
  checked('Firefox 완전 종료·재실행 후 재등록 없이 확장과 저장 데이터 유지');
  await writeFile(path.join(temporary, 'signed-firefox-restart.png'), await driver.takeScreenshot(), 'base64');
  await writeFile(path.join(temporary, 'signed-firefox-qa.json'), JSON.stringify({ checkedAt: new Date().toISOString(), browserVersion, version: manifest.version, checks, profile,
    installed: { id: installed.id, location: installed.location, signedState: installed.signedState },
    limitations: ['별도 프로필에서 검증했으며 사용자의 기본 Firefox 프로필에는 설치하지 않았습니다.', '로그인한 실제 Play Books 독서 화면은 사용하지 않았습니다.'] }, null, 2));
} finally { if (driver) await driver.quit(); }
