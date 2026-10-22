import { LocaleProvider, useI18n } from './i18n';
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { emptyState, type Book, type Session } from '../domain/model';
import { type Snapshot } from '../shared/messages';
import { extensionAvailable, request } from './client';
import { sections, type Section, navIcons, isPopup, type Run } from './components/common';
import { Home } from './pages/Home';
import { Stats } from './pages/Stats';
import { BookForm, Library } from './pages/Library';
import { SessionForm } from './components/SessionForm';
import { History } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { Popup } from './pages/Popup';
export function App() {
    const [snapshot, setSnapshot] = useState<Snapshot>();
    const { t, locale, errorText } = useI18n(snapshot?.state.settings.language ?? 'system');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const initialSection = location.hash.slice(1);
    const [section, setSection] = useState<Section>(initialSection in sections ? initialSection as Section : 'home');
    const [bookEditor, setBookEditor] = useState<{
        value?: Book;
    }>();
    const [sessionEditor, setSessionEditor] = useState<{
        value?: Session;
    }>();
    const [historyBook, setHistoryBook] = useState('');
    const refresh = useCallback(async () => {
        if (!extensionAvailable()) {
            if (import.meta.env.DEV)
                setSnapshot({ state: emptyState(), nextAlarm: null });
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
        const interval = setInterval(() => void refresh(), 5000);
        const changed = () => void refresh();
        if (extensionAvailable())
            browser.storage.onChanged.addListener(changed);
        return () => { clearInterval(interval); if (extensionAvailable())
            browser.storage.onChanged.removeListener(changed); };
    }, [refresh]);
    useEffect(() => { const hash = () => { const value = location.hash.slice(1); if (value in sections)
        setSection(value as Section); }; window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash); }, []);
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
            if (isPopup && (command.type === 'START' || command.type === 'RESUME') && browser.extension.getViews({ type: 'popup' }).includes(window))
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
    const closeBook = useCallback(() => setBookEditor(undefined), []);
    const closeSession = useCallback(() => setSessionEditor(undefined), []);
    const navigate = (value: Section) => { setSection(value); location.hash = value; };
    if (!snapshot)
        return <LocaleProvider language="system"><main className="loading" role={error ? 'alert' : 'status'}><div className="brand-mark">▤</div><h1>ReadChime</h1><p>{errorText(error) || t("독서 기록을 불러오는 중…")}</p>{error && <button onClick={() => void refresh()}>{t("다시 시도")}</button>}</main></LocaleProvider>;
    const state = snapshot.state;
    const shared = { state, run, busy, detection: snapshot.detection };
    const messages = <>{!extensionAvailable() && <div className="info-box preview-notice">{t("개발 화면 미리보기 · 실제 데이터를 읽고 저장하려면 Firefox 확장 설치가 필요합니다.")}</div>}{(error || state.reminder.lastError) && <div role="alert" className="error-box dismissible"><span>{errorText(error || state.reminder.lastError)}</span><button aria-label={t("오류 안내 닫기")} onClick={() => setError('')}>×</button></div>}{notice && <div role="status" className="toast">✓ {errorText(notice)}</div>}</>;
    return <LocaleProvider language={state.settings.language}>{isPopup ? <>{messages}<Popup {...shared} manual={() => setSessionEditor({})}/></> : <div className="app-shell"><aside className="sidebar"><a href="#home" className="brand" aria-label={t("ReadChime 홈")}><span className="brand-mark">▤</span><div><strong>ReadChime</strong><small>{t("하루 한 페이지")}</small></div></a><nav aria-label={t("주 메뉴")}>{Object.entries(sections).map(([key, label]) => <a key={key} href={`#${key}`} aria-current={section === key ? 'page' : undefined} className={section === key ? 'active' : ''}><span aria-hidden="true">{navIcons[key as Section]}</span>{t(label)}</a>)}</nav><div className="sidebar-bottom"><div className="local-badge">{t("◉ 이 Firefox에 저장")}</div><p>{t("독서 기록은")}<br />{t("이 Firefox 안에.")}</p><small>{t("동기화·계정·추적 없음")}</small></div></aside><main className="main"><header className="topbar"><span>{new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span><span className="pill">{t("나만의 독서 공간")}</span></header>{messages}{section === 'home' && <Home {...shared} manual={() => setSessionEditor({})} navigate={navigate}/>}{section === 'stats' && <Stats state={state}/>}{section === 'library' && <Library {...shared} edit={value => setBookEditor({ value })} history={id => { setHistoryBook(id); navigate('history'); }}/>}{section === 'history' && <History key={historyBook} {...shared} initialBook={historyBook} edit={value => setSessionEditor({ value })}/>}{section === 'settings' && <SettingsPage {...shared} nextAlarm={snapshot.nextAlarm}/>}<footer className="page-footer">{t("적게 읽어도 괜찮아요. 다시 펼치는 것부터 시작해요.")}</footer></main></div>}{bookEditor && <BookForm initial={bookEditor.value} run={run} busy={busy} close={closeBook}/>}{sessionEditor && <SessionForm {...shared} initial={sessionEditor.value} close={closeSession}/>}</LocaleProvider>;
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
