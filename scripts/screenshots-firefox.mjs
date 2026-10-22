// Captures every UI surface in light/dark × ko/en with seeded synthetic data.
// Usage: node scripts/screenshots-firefox.mjs <label>   (writes artifacts/screenshots/<label>/)
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const label = process.argv[2] ?? 'current';
const out = path.resolve('artifacts', 'screenshots', label);
await mkdir(out, { recursive: true });
const temporary = path.resolve('.tmp');
await mkdir(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
const profile = await mkdtemp(path.join(temporary, 'shots-firefox-'));
const uuid = '00000000-0000-4000-8000-000000000009';
const base = `moz-extension://${uuid}/`;
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
  .addArguments('-headless', '-no-remote', '-profile', profile)
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'readchime@local.invalid': uuid }))
  .setPreference('intl.locale.requested', 'ko');
const binary = await download('0.37.1', path.join(temporary, 'geckodriver'));
const log = openSync(path.join(temporary, 'shots-geckodriver.log'), 'a');
const service = new firefox.ServiceBuilder(binary).setStdio(['ignore', log, log]);
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();

async function command(value) {
  const reply = await driver.executeAsyncScript('const done=arguments[arguments.length-1];browser.runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:String(e)}));', value);
  assert.equal(reply.ok, true, reply.error); return reply;
}
async function shot(name) {
  await driver.sleep(400);
  await writeFile(path.join(out, `${name}.png`), await driver.takeScreenshot(), 'base64');
  console.log(`saved ${name}.png`);
}
function day(offset) { const d = new Date(); d.setDate(d.getDate() - offset); return d; }

try {
  await driver.manage().setTimeouts({ script: 20000, pageLoad: 30000 });
  await driver.installAddon(path.resolve('dist'), true);
  await driver.get(`${base}dashboard.html`);
  await driver.wait(until.elementLocated(By.css('.app-shell')), 15000);
  const dashboard = await driver.getWindowHandle();

  // Deterministic synthetic library and ~6 weeks of history.
  const now = new Date().toISOString();
  const books = [
    ['아몬드', '손원평', 'reading'], ['The Pragmatic Programmer', 'David Thomas, Andrew Hunt', 'reading'],
    ['사피엔스', '유발 하라리', 'paused'], ['Atomic Habits', 'James Clear', 'completed'], ['채식주의자', '한강', 'planned'],
  ].map(([title, author, status], i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, title, author, url: `https://play.google.com/books/reader?id=shot-${i}`, status, notes: i === 0 ? '두 번째 장부터 다시 읽기' : '', createdAt: now, updatedAt: now }));
  for (const book of books) await command({ type: 'SAVE_BOOK', book });
  const devices = ['tablet', 'desktop', 'smartphone', 'paper'];
  for (let offset = 1, n = 0; offset <= 42; offset++) {
    if ((offset * 7) % 5 === 0) continue;
    const minutes = [3, 6, 12, 5, 20, 8, 15][offset % 7];
    const start = day(offset); start.setHours(22, 0, 0, 0);
    const end = new Date(start.getTime() + minutes * 60000);
    const book = books[offset % 3];
    await command({ type: 'SAVE_SESSION', session: {
      id: `00000000-0000-4000-8000-0000000002${String(n++).padStart(2, '0')}`, bookId: book.id, bookTitle: book.title,
      startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds: minutes * 60,
      source: offset % 4 ? 'automatic' : 'manual', measurement: offset % 4 ? 'timer' : 'entry', device: devices[offset % 4], notes: '',
      localDate: start.toLocaleDateString('en-CA'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: end.toISOString(), updatedAt: end.toISOString(), interrupted: false, corrected: false,
    } });
  }
  await command({ type: 'SELECT_BOOK', id: books[0].id });

  for (const language of ['ko', 'en']) for (const theme of ['light', 'dark']) {
    await driver.switchTo().window(dashboard);
    const state = (await command({ type: 'GET_STATE' })).snapshot.state;
    await command({ type: 'SAVE_SETTINGS', settings: { ...state.settings, language, theme, reminderEnabled: false } });
    const tag = `${language}-${theme}`;
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    for (const section of ['home', 'stats', 'library', 'history', 'settings']) {
      await driver.get(`${base}dashboard.html#${section}`);
      await driver.wait(until.elementLocated(By.css('.app-shell')), 10000);
      await driver.wait(async () => await driver.executeScript('return document.documentElement.dataset.theme') === theme, 5000);
      if (section === 'stats') await driver.wait(until.elementLocated(By.css('.recharts-surface')), 8000);
      await shot(`${section}-${tag}`);
    }
    await driver.manage().window().setRect({ width: 420, height: 900 });
    await driver.get(`${base}dashboard.html#home`); await driver.wait(until.elementLocated(By.css('.app-shell')), 10000);
    await shot(`home-narrow-${tag}`);
    await driver.manage().window().setRect({ width: 360, height: 640 });
    await driver.get(`${base}popup.html`); await driver.wait(until.elementLocated(By.css('.popup')), 10000);
    await shot(`popup-${tag}`);

    // Reader prompt over a synthetic reader shell on the allowed origin (no account or book content).
    await driver.manage().window().setRect({ width: 1280, height: 800 });
    await driver.switchTo().newWindow('tab');
    let shown = false;
    for (let attempt = 0; attempt < 3 && !shown; attempt++) {
      // The content script can miss the first synthetic page right after install; reload and retry.
      await driver.get('https://play.google.com/books');
      await driver.executeScript(`history.replaceState({}, '', '/books/reader?id=shot-1&pg=9');document.title='Shot - Google Play Books';document.body.style.background=arguments[0];const doc=new DOMParser().parseFromString('<reader-control></reader-control><iframe class="-gb-display"></iframe>', 'text/html');document.body.replaceChildren(...doc.body.childNodes);`, theme === 'dark' ? '#202124' : '#ffffff');
      try { await driver.wait(until.elementLocated(By.id('readchime-reader-prompt')), 8000); shown = true; } catch { /* retry */ }
    }
    if (shown) await shot(`reader-prompt-${tag}`); else console.warn(`reader prompt did not appear for ${tag}`);
    await driver.close(); await driver.switchTo().window(dashboard);
  }
  console.log(`Screenshots written to ${out}`);
} finally { await driver.quit(); }
