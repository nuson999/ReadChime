import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { intlLocale, localizeError, resolveLanguage, translate, type Language, type Locale } from '../i18n';
import { minuteText } from '../domain/time';

const LocaleContext = createContext<Locale>(resolveLanguage());
export function LocaleProvider({ language, children }: { language: Language; children: ReactNode }) {
  const locale = resolveLanguage(language);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(location.pathname.endsWith('popup.html') ? 'ReadChime' : 'ReadChime · 독서 대시보드', [], locale);
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useI18n(preference?: Language) {
  const context = useContext(LocaleContext);
  const language = preference === undefined ? context : resolveLanguage(preference);
  return {
    t: (message: string, values?: readonly (string | number)[]) => translate(message, values, language),
    errorText: (message: string) => localizeError(message, language),
    minutes: (seconds: number) => minuteText(seconds, language),
    dateText: (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString(intlLocale(language), { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }),
    locale: intlLocale(language),
  };
}
