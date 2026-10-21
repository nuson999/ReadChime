import english from './en.json';

export type Language = 'system' | 'ko' | 'en';
export type Locale = 'ko' | 'en';
export const englishMessages: Readonly<Record<string, string>> = english;

export function browserLanguage(): string {
  if (typeof browser !== 'undefined' && browser.i18n?.getUILanguage) return browser.i18n.getUILanguage();
  return typeof navigator !== 'undefined' ? navigator.language : 'en';
}
export function resolveLanguage(language: Language = 'system', system = browserLanguage()): Locale {
  return language === 'system' ? /^ko(?:[-_]|$)/i.test(system) ? 'ko' : 'en' : language;
}
export function intlLocale(locale: Locale): string { return locale === 'ko' ? 'ko-KR' : 'en-US'; }

// Korean source messages are stable identifiers. Only app-owned copy passes through here.
// User content is inserted after translation, so braces or markup in a title are never interpreted.
export function translate(message: string, values: readonly (string | number)[] = [], locale: Locale = resolveLanguage()): string {
  const template = locale === 'en' && Object.hasOwn(englishMessages, message) ? englishMessages[message] : message;
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? placeholder : typeof value === 'number' ? value.toLocaleString(intlLocale(locale)) : value;
  });
}

export function localizeError(message: string, locale: Locale): string {
  // Zod errors may be serialized by the background. Show their useful custom messages
  // in the selected language, with a friendly fallback for generated schema details.
  if (message.startsWith('[')) {
    try {
      const issues: unknown = JSON.parse(message);
      if (Array.isArray(issues) && issues.every(issue => issue && typeof issue === 'object' && 'message' in issue)) {
        return [...new Set(issues.map(issue => {
          const text: unknown = issue.message;
          return translate(typeof text === 'string' && text in englishMessages ? text : '요청에 올바르지 않은 값이 있습니다. 입력 내용을 확인하세요.', [], locale);
        }))].join(' ');
      }
    } catch { /* Browser errors are displayed as supplied when they are not schema issues. */ }
  }
  const original = Object.keys(englishMessages).find(key => englishMessages[key] === message) ?? message;
  return translate(original, [], locale);
}
