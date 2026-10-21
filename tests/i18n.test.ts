import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { browserLanguage, englishMessages, localizeError, resolveLanguage, translate } from '../src/i18n';
import { emptyState, settingsSchema } from '../src/domain/model';
import { exportBackup, mergeBackup, parseBackup } from '../src/data/backup';
import { migrate } from '../src/data/repository';

afterEach(() => vi.unstubAllGlobals());

describe('language resolution and display', () => {
  it('uses the Firefox UI language for System, with English fallback and explicit overrides', () => {
    vi.stubGlobal('browser', { i18n: { getUILanguage: () => 'ko-KR' } });
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(browserLanguage()).toBe('ko-KR');
    expect(resolveLanguage()).toBe('ko');
    for (const language of ['ko', 'ko-KR', 'KO_kr']) expect(resolveLanguage('system', language)).toBe('ko');
    for (const language of ['en-GB', 'fr', '', 'kok']) expect(resolveLanguage('system', language)).toBe('en');
    expect(resolveLanguage('en', 'ko')).toBe('en');
    expect(resolveLanguage('ko', 'en-US')).toBe('ko');
    vi.stubGlobal('browser', undefined);
    expect(browserLanguage()).toBe('en-US');
  });
  it('interpolates after translation and preserves user content verbatim', () => {
    const title = '한국어 title {1} <img src=x> $&';
    expect(translate('‘{0}’을 서재에서 제거할까요? 독서 기록은 보존합니다.', [title], 'en'))
      .toBe(`Remove “${title}” from your library? Reading history will be kept.`);
    expect(translate('{0}권', [2000], 'en')).toBe('2,000 books');
    expect(translate('{0}권', [2000], 'ko')).toBe('2,000권');
  });
  it('localizes stored errors and serialized schema errors without exposing schema JSON', () => {
    expect(localizeError('올바른 JSON 파일이 아닙니다.', 'en')).toBe('This is not a valid JSON file.');
    expect(localizeError('Settings saved.', 'ko')).toBe('설정을 저장했습니다.');
    expect(localizeError(JSON.stringify([{ message: '올바른 날짜를 입력하세요.' }, { message: 'Invalid type' }]), 'en'))
      .toBe('Enter a valid date. The request contains invalid values. Check your input.');
    expect(localizeError('A browser error', 'ko')).toBe('A browser error');
  });
});

describe('translation coverage', () => {
  it('has an English translation for every Korean source message and preserves placeholders', () => {
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
    });
    const missing = new Set<string>();
    for (const file of files('src')) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) && /[가-힣]/.test(node.text) && node.text !== '한국어' && !(node.text in englishMessages)) missing.add(node.text);
        if (ts.isJsxText(node) && /[가-힣]/.test(node.text) && node.text.trim() !== '한국어') missing.add(node.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect([...missing]).toEqual([]);
    const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    for (const [key, value] of Object.entries(englishMessages)) {
      expect(value.trim(), key).not.toBe('');
      expect(placeholders(value), key).toEqual(placeholders(key));
    }
  });
});

describe('settings and backup compatibility', () => {
  it('defaults older v2 data and backups to System without changing reading content', () => {
    const current = emptyState();
    current.settings.language = 'ko';
    const raw = JSON.parse(exportBackup(current));
    delete raw.settings.language;
    expect(parseBackup(JSON.stringify(raw)).settings.language).toBe('system');
    const legacy = JSON.parse(JSON.stringify(current));
    delete legacy.settings.language;
    expect(migrate(legacy).settings.language).toBe('system');
    expect(settingsSchema.parse({}).language).toBe('system');
    expect(() => settingsSchema.parse({ language: 'fr' })).toThrow();
  });
  it('round-trips language and only changes it when imported settings are chosen', () => {
    const current = emptyState(); current.settings.language = 'en';
    const incoming = emptyState(); incoming.settings.language = 'ko';
    const imported = parseBackup(exportBackup(incoming));
    expect(imported.settings.language).toBe('ko');
    expect(mergeBackup(current, imported, [], false).settings.language).toBe('en');
    expect(mergeBackup(current, imported, [], true).settings.language).toBe('ko');
    expect(current.settings.language).toBe('en');
    expect(parseBackup(exportBackup(current))).toMatchObject({ books: current.books, sessions: current.sessions, goals: current.goals });
  });
});
