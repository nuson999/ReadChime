import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.persistent, false);
assert.equal(manifest.background.service_worker, undefined);
assert.equal(manifest.default_locale, 'en');
for (const locale of ['ko', 'en']) {
  const messages = JSON.parse(await readFile(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
  for (const value of [manifest.name, manifest.description, manifest.action.default_title]) {
    const key = /^__MSG_(\w+)__$/.exec(value)?.[1];
    assert.ok(key && messages[key]?.message, `Missing ${locale} manifest translation: ${value}`);
  }
}
const resources = [manifest.action.default_popup, ...manifest.background.scripts, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => script.js), 'dashboard.html'];
for (const resource of resources) await access(path.join(root, resource));
for (const html of ['dashboard.html', 'popup.html']) {
  const source = await readFile(path.join(root, html), 'utf8');
  assert.ok(!/<script[^>]*src="https?:/i.test(source));
  for (const match of source.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g)) await access(path.join(root, match[1]));
}
console.log('배포 파일 확인: manifest, 아이콘, 백그라운드, 콘텐츠 스크립트, 팝업, 대시보드, 로컬 자산 경로 정상');
