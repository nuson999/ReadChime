import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';

async function licenses() {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const notices = ['ReadChime에서 사용하는 외부 런타임 라이브러리의 저작권과 라이선스 안내입니다.'];
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location.startsWith('node_modules/') || entry.dev) continue;
    const pkg = JSON.parse(await readFile(`${location}/package.json`, 'utf8'));
    notices.push(`\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\n라이선스: ${pkg.license ?? entry.license ?? '패키지 원문 참고'}\n`);
    const files = (await readdir(location)).filter(name => /^(licen[cs]e|copying)(\.|$)/i.test(name));
    for (const file of files) notices.push(await readFile(`${location}/${file}`, 'utf8'));
  }
  await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n'));
}

const options = {
  entryPoints: { background: 'src/background/index.ts', content: 'src/content/index.ts' },
  outdir: 'dist', bundle: true, format: 'iife', target: 'firefox140',
  sourcemap: false, minify: true, legalComments: 'none',
};
if (process.argv.includes('--watch')) {
  const ui = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--watch', '--emptyOutDir', 'false'], { stdio: 'inherit' });
  const watcher = await context(options);
  await watcher.watch();
  process.on('SIGINT', async () => { ui.kill(); await watcher.dispose(); process.exit(); });
  console.log('확장 빌드를 감시합니다. 다른 터미널에서 npm run firefox를 실행하세요.');
} else {
  await build(options);
  await licenses();
}
