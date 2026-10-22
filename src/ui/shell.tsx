import React, { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './components/Icon';
import { createRoot } from 'react-dom/client';
import { LocaleProvider, useI18n } from './i18n';
import type { Snapshot } from '../shared/messages';
import { extensionAvailable, request } from './client';
import type { Run } from './components/common';
import './style.css';

/** Snapshot loading, live updates, theme and command dispatch shared by the popup and dashboard. */
export function useAppState({ popup = false } = {}) {
    const [snapshot, setSnapshot] = useState<Snapshot>();
    const i18n = useI18n(snapshot?.state.settings.language ?? 'system');
    const { t } = i18n;
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const refresh = useCallback(async () => {
        if (!extensionAvailable()) {
            // Dev-only preview; the dynamic import keeps zod out of the production UI bundles.
            if (import.meta.env.DEV)
                setSnapshot({ state: (await import('../domain/model')).emptyState(), nextAlarm: null });
            else
                setError(t("Firefox 확장으로 설치한 뒤 열어 주세요. README의 설치 방법을 확인하세요."));
            return;
        }
        try {
            const reply = await request({ type: 'GET_STATE' });
            if (reply.snapshot)
                setSnapshot(reply.snapshot);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("기록을 불러오지 못했습니다."));
        }
    }, []);
    useEffect(() => {
        void refresh();
        // Stored state (including the running timer) arrives via storage.onChanged. Reader detection
        // and the next alarm live only in the background, so re-read them when the page comes back.
        const changed = () => void refresh();
        const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
        if (extensionAvailable())
            browser.storage.onChanged.addListener(changed);
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('focus', changed);
        // Re-render just after local midnight so "today" totals roll over on a page left open.
        let midnight: ReturnType<typeof setTimeout>;
        const scheduleMidnight = () => { const next = new Date(); next.setHours(24, 0, 1, 0); midnight = setTimeout(() => { void refresh(); scheduleMidnight(); }, next.getTime() - Date.now()); };
        scheduleMidnight();
        return () => {
            clearTimeout(midnight);
            if (extensionAvailable())
                browser.storage.onChanged.removeListener(changed);
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener('focus', changed);
        };
    }, [refresh]);
    useEffect(() => {
        const media = matchMedia('(prefers-color-scheme: dark)');
        const apply = () => { const theme = snapshot?.state.settings.theme ?? 'system'; document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
        apply();
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, [snapshot?.state.settings.theme]);
    useEffect(() => { if (notice) {
        const timeout = setTimeout(() => setNotice(''), 4000);
        return () => clearTimeout(timeout);
    } }, [notice]);
    const run: Run = async (command, message) => {
        setBusy(true);
        setError('');
        try {
            const reply = await request(command);
            if (reply.snapshot)
                setSnapshot(reply.snapshot);
            else
                await refresh();
            if (message)
                setNotice(message);
            if (popup && (command.type === 'START' || command.type === 'RESUME') && browser.extension.getViews({ type: 'popup' }).includes(window))
                window.close();
            return true;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("처리하지 못했습니다."));
            return false;
        }
        finally {
            setBusy(false);
        }
    };
    const loading = !snapshot && <LocaleProvider language="system"><main className="loading" role={error ? 'alert' : 'status'}><div className="brand-mark"><Icon name="book" size={22}/></div><h1>ReadChime</h1><p>{i18n.errorText(error) || t("독서 기록을 불러오는 중…")}</p>{error && <button onClick={() => void refresh()}>{t("다시 시도")}</button>}</main></LocaleProvider>;
    const messages = snapshot && <>{!extensionAvailable() && <div className="info-box preview-notice">{t("개발 화면 미리보기 · 실제 데이터를 읽고 저장하려면 Firefox 확장 설치가 필요합니다.")}</div>}{(error || snapshot.state.reminder.lastError) && <div role="alert" className="error-box dismissible"><span>{i18n.errorText(error || snapshot.state.reminder.lastError)}</span><button aria-label={t("오류 안내 닫기")} onClick={() => setError('')}><Icon name="close"/></button></div>}<div role="status" aria-live="polite" className="toast-region">{notice && <div className="toast"><Icon name="check" size={16}/>{i18n.errorText(notice)}</div>}</div></>;
    return { snapshot, run, busy, loading, messages, ...i18n };
}
export function ErrorFallback() {
 const { t } = useI18n(document.documentElement.lang === 'ko' ? 'ko' : 'en');
 return <main className="loading"><h1>{t("화면을 표시하지 못했습니다")}</h1><p>{t("저장된 독서 기록은 그대로 유지됩니다. 화면을 다시 열어 주세요.")}</p><button onClick={() => location.reload()}>{t("다시 불러오기")}</button></main>;
}
export class ErrorBoundary extends Component<{
    children: ReactNode;
}, {
    failed: boolean;
}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? <ErrorFallback/> : this.props.children; }
}
export function mount(app: ReactNode) {
    createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary>{app}</ErrorBoundary></React.StrictMode>);
}
