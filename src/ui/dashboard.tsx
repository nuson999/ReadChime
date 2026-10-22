import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { LocaleProvider } from './i18n';
import type { Book, Session } from '../domain/model';
import { sections, type Section, navIcons } from './components/common';
import { Home } from './pages/Home';
import { BookForm, Library } from './pages/Library';
import { SessionForm } from './components/SessionForm';
import { History } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { mount, useAppState } from './shell';

// recharts is only needed on the statistics page, so keep it out of the initial bundle.
const Stats = lazy(() => import('./pages/Stats').then(module => ({ default: module.Stats })));

function Dashboard() {
    const { snapshot, run, busy, loading, messages, t, locale } = useAppState();
    const initialSection = location.hash.slice(1);
    const [section, setSection] = useState<Section>(initialSection in sections ? initialSection as Section : 'home');
    const [bookEditor, setBookEditor] = useState<{
        value?: Book;
    }>();
    const [sessionEditor, setSessionEditor] = useState<{
        value?: Session;
    }>();
    const [historyBook, setHistoryBook] = useState('');
    useEffect(() => { const hash = () => { const value = location.hash.slice(1); if (value in sections)
        setSection(value as Section); }; window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash); }, []);
    const closeBook = useCallback(() => setBookEditor(undefined), []);
    const closeSession = useCallback(() => setSessionEditor(undefined), []);
    const navigate = (value: Section) => { setSection(value); location.hash = value; };
    if (!snapshot)
        return loading;
    const state = snapshot.state;
    const shared = { state, run, busy, detection: snapshot.detection };
    return <LocaleProvider language={state.settings.language}><div className="app-shell"><aside className="sidebar"><a href="#home" className="brand" aria-label={t("ReadChime 홈")}><span className="brand-mark">▤</span><div><strong>ReadChime</strong><small>{t("하루 한 페이지")}</small></div></a><nav aria-label={t("주 메뉴")}>{Object.entries(sections).map(([key, label]) => <a key={key} href={`#${key}`} aria-current={section === key ? 'page' : undefined} className={section === key ? 'active' : ''}><span aria-hidden="true">{navIcons[key as Section]}</span>{t(label)}</a>)}</nav><div className="sidebar-bottom"><div className="local-badge">{t("◉ 이 Firefox에 저장")}</div><p>{t("독서 기록은")}<br />{t("이 Firefox 안에.")}</p><small>{t("동기화·계정·추적 없음")}</small></div></aside><main className="main"><header className="topbar"><span>{new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span><span className="pill">{t("나만의 독서 공간")}</span></header>{messages}{section === 'home' && <Home {...shared} manual={() => setSessionEditor({})} navigate={navigate}/>}{section === 'stats' && <Suspense fallback={<p className="muted" role="status">{t("독서 기록을 불러오는 중…")}</p>}><Stats state={state}/></Suspense>}{section === 'library' && <Library {...shared} edit={value => setBookEditor({ value })} history={id => { setHistoryBook(id); navigate('history'); }}/>}{section === 'history' && <History key={historyBook} {...shared} initialBook={historyBook} edit={value => setSessionEditor({ value })}/>}{section === 'settings' && <SettingsPage {...shared} nextAlarm={snapshot.nextAlarm}/>}<footer className="page-footer">{t("적게 읽어도 괜찮아요. 다시 펼치는 것부터 시작해요.")}</footer></main></div>{bookEditor && <BookForm initial={bookEditor.value} run={run} busy={busy} close={closeBook}/>}{sessionEditor && <SessionForm {...shared} initial={sessionEditor.value} close={closeSession}/>}</LocaleProvider>;
}
mount(<Dashboard />);
