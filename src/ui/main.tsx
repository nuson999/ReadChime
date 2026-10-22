import { LocaleProvider, useI18n } from './i18n';
import React, { Component, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { emptyState, type State, type Book, type Session, type Settings } from '../domain/model';
import { recommend, detectedBook } from '../domain/books';
import type { Detection } from '../domain/detector';
import { clockText, currentTimezone, localDate } from '../domain/time';
import { allReadings, dailySeries, summary } from '../domain/statistics';
import type { Command, ImportPreview, Snapshot } from '../shared/messages';
import { extensionAvailable, request } from './client';
import { Modal } from './Modal';
import { LibraryImport } from './LibraryImport';
import './style.css';
const sections = { home: '홈', stats: '통계', library: '내 서재', history: '독서 기록', settings: '설정' } as const;
type Section = keyof typeof sections;
const statusNames: Record<Book['status'], string> = { planned: '읽을 책', reading: '읽는 중', completed: '완독', paused: '잠시 멈춤' };
const deviceNames: Record<Session['device'], string> = { desktop: '데스크톱', tablet: '태블릿', smartphone: '스마트폰', paper: '종이책', other: '기타' };
const navIcons = { home: '⌂', stats: '▥', library: '▤', history: '◷', settings: '⚙' };
const isPopup = location.pathname.endsWith('popup.html');
function Field({ label, children, hint }: {
    label: string;
    children: ReactNode;
    hint?: string;
}) {
    return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Empty({ title, children }: {
    title: string;
    children: ReactNode;
}) {
    return <div className="empty"><span className="empty-symbol" aria-hidden="true">▤</span><h3>{title}</h3><p>{children}</p></div>;
}
function Progress({ seconds, goal, small = false }: {
    seconds: number;
    goal: number;
    small?: boolean;
}) {
    const { t, minutes: formatMinutes } = useI18n();
    const fraction = Math.min(1, seconds / (goal * 60));
    return <div className={`progress-ring ${small ? 'small' : ''}`} role="progressbar" aria-label={t("오늘 독서 목표")} aria-valuemin={0} aria-valuemax={goal * 60} aria-valuenow={Math.min(seconds, goal * 60)} aria-valuetext={t("{0}분 / {1}분", [formatMinutes(seconds), goal])}>
    <svg viewBox="0 0 160 160" aria-hidden="true"><circle className="ring-track" cx="80" cy="80" r="69"/><circle className="ring-value" cx="80" cy="80" r="69" strokeDasharray={`${fraction * 433.54} 433.54`}/></svg>
    <div><strong>{formatMinutes(seconds)}<span>{t("분")}</span></strong><small>{fraction >= 1 ? t("오늘 목표 달성 ✓") : t("{0}분을 향해", [goal])}</small></div></div>;
}
type Run = (command: Command, notice?: string) => Promise<boolean>;
interface SharedProps {
    state: State;
    run: Run;
    busy: boolean;
    detection?: Detection;
}
function Timer({ state, run, busy, detection }: SharedProps) {
    const { t } = useI18n();
    const [confirmed, setConfirmed] = useState(false);
    const book = detection?.key ? detectedBook(state, detection.key) : recommend(state);
    useEffect(() => setConfirmed(false), [book?.id]);
    const active = state.active;
    const restore = !!book && (!!book.archivedAt || book.status === 'completed' || book.status === 'paused');
    const seconds = active?.buckets.reduce((v, b) => v + b.seconds, 0) ?? 0;
    return <section className="card timer-card"><div className="section-heading"><h2>{active ? t("지금 읽는 책") : detection?.key ? t("Play Books에서 감지한 책") : t("한 페이지부터 시작")}</h2><span className={`pill ${active?.status === 'running' ? 'live' : ''}`}>{active ? { running: t("● 독서 시간 측정 중"), waiting: t("책 탭으로 돌아오세요"), paused: t("일시정지") }[active.status] : t("시작 준비 완료")}</span></div>
    {active ? <><p className="timer-title">{active.bookTitle}</p><div className="timer-digits">{clockText(seconds)}</div><p className="muted">{t("추정 독서 시간 · 확인된 구간만 약 5초마다 합산")}</p><div className="actions"><button disabled={busy} onClick={() => void run({ type: active.status === 'paused' ? 'RESUME' : 'PAUSE' })}>{active.status === 'paused' ? t("이어서 읽기") : t("일시정지")}</button><button className="primary" disabled={busy} onClick={() => void run({ type: 'STOP' }, t("확인된 독서 시간을 저장했습니다."))}>{t("종료하고 저장")}</button></div>{active.status !== 'running' && <p className="help">{t("책이 보이면 다른 앱에서 메모해도 측정합니다. 책을 숨겼다가 5초 안에 돌아오면 자동으로 이어지고, 넘기면 읽기 재개를 눌러 주세요.")}</p>}</>
            : <><h3>{book?.pendingTitle ? t("제목 확인 중") : book?.title ?? t("오늘 읽을 책을 골라 보세요")}</h3>{book?.pendingTitle && <small className="muted">{detection?.key}</small>}<p className="muted">{book?.author || t("책 한 권과 짧은 시간이면 충분해요.")}</p>{restore && <p className="help">{t("완독·잠시 멈춤·보관 상태를 유지하고 있습니다. 읽기 재개를 누르면 다시 기록합니다.")}</p>}<div className="actions"><button className="primary" disabled={busy || !book?.url} onClick={() => book && void run({ type: 'START', id: book.id, confirm: confirmed, restore })}>{t(restore ? "읽기 재개" : "▶ 독서 시작")}</button><button disabled={busy} onClick={() => void run({ type: 'OPEN_BOOK', id: book?.id })}>{book?.url ? t("책 열기") : t("서재에서 책 고르기")}</button></div>{book?.url && !detection?.supported && <label className="check compact"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t("이 탭에서 실제로 읽고 있습니다 ")}<span className="muted">{t("(리더 감지에 실패한 경우)")}</span></label>}<p className="help">{t("독서 시간은 시작 버튼을 누른 뒤부터 기록합니다. 다른 책을 열면 새 책에서 다시 시작해 주세요.")}</p></>}
  </section>;
}
function ReminderActions({ state, run, busy }: SharedProps) {
    const { t, locale } = useI18n();
    const today = localDate();
    return <div className="reminder-actions"><span className="muted">{state.reminder.skipped.includes(today) ? t("오늘 알림은 건너뜁니다.") : state.reminder.snooze ? t("{0}에 다시 알림", [new Date(state.reminder.snooze.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })]) : `${state.settings.hour.toString().padStart(2, '0')}:${state.settings.minute.toString().padStart(2, '0')} · ${state.settings.reminderEnabled ? t("독서 알림") : t("알림 꺼짐")}`}</span><div className="actions"><button className="text-button" disabled={busy} onClick={() => void run({ type: 'SNOOZE' }, t("다시 알림을 예약했습니다."))}>{t("{0}분 뒤 알림", [state.settings.snoozeMinutes])}</button><button className="text-button" disabled={busy} onClick={() => void run({ type: 'SKIP' }, t("오늘 정기 알림을 건너뜁니다."))}>{t("오늘 알림 건너뛰기")}</button></div></div>;
}
function Home(props: SharedProps & {
    manual: () => void;
    navigate: (section: Section) => void;
}) {
    const { t, locale, minutes: formatMinutes } = useI18n();
    const { state, manual, navigate } = props;
    const totals = summary(state);
    const series = dailySeries(state, 7);
    return <><div className="page-intro"><span className="eyebrow">{t("조금씩 쌓이는 독서")}</span><h1>{t("오늘도 한 페이지.")}</h1><p>{t("많이 읽지 못해도 책을 다시 펼쳐 보세요.")}</p></div><div className="home-grid"><section className="card today-card"><div><span className="eyebrow">{t("오늘의 독서")}</span><h2>{totals.todaySeconds >= totals.goal * 60 ? t("오늘의 약속을 지켰어요") : t("{0}분이면 좋은 시작이에요", [totals.goal])}</h2><p className="muted">{t("여러 번 나눠 읽은 시간도 모두 합산합니다.")}</p><button className="text-button" onClick={manual}>{t("＋ 다른 기기로 읽은 시간 기록")}</button></div><Progress seconds={totals.todaySeconds} goal={totals.goal}/></section><Timer {...props}/></div>
    <div className="metric-grid"><div className="card metric"><span>{t("이번 주")}</span><strong>{formatMinutes(totals.weekSeconds)}<small>{t(" 분")}</small></strong><p>{t("월요일부터 오늘까지")}</p></div><div className="card metric"><span>{t("이번 달")}</span><strong>{formatMinutes(totals.monthSeconds)}<small>{t(" 분")}</small></strong><p>{t("이번 달 누적 독서 시간")}</p></div><div className="card metric"><span>{t("최근 7일 목표 달성")}</span><strong>{series.filter(d => d.complete).length}<small>{t(" / 7일")}</small></strong><p>{t("날짜별로 설정한 목표 기준")}</p></div></div>
    <section className="card"><div className="section-heading"><h2>{t("일주일의 독서")}</h2><button className="text-button" onClick={() => navigate('stats')}>{t("통계 더 보기 →")}</button></div><div className="week-strip">{series.map(d => <div key={d.date} className={d.complete ? 'done' : ''}><span>{new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })}</span><div className="day-dot">{d.complete ? '✓' : d.seconds > 0 ? '·' : ''}</div><small>{t("{0}분", [formatMinutes(d.seconds)])}</small></div>)}</div></section><ReminderActions {...props}/></>;
}
function Stats({ state }: {
    state: State;
}) {
    const { t, locale, minutes: formatMinutes, dateText } = useI18n();
    const [period, setPeriod] = useState(30);
    const days = dailySeries(state, period).map(day => ({ ...day, label: new Date(`${day.date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' }) }));
    const calendar = dailySeries(state, 91);
    const readings = allReadings(state);
    const total = days.reduce((sum, day) => sum + day.seconds, 0);
    const complete = days.filter(d => d.complete).length;
    const byBook = new Map<string, {
        title: string;
        seconds: number;
    }>();
    const byDevice = new Map<string, number>();
    for (const record of readings) {
        const previous = byBook.get(record.bookId);
        byBook.set(record.bookId, { title: state.books.find(b => b.id === record.bookId)?.title ?? record.bookTitle, seconds: (previous?.seconds ?? 0) + record.durationSeconds });
        byDevice.set(record.device, (byDevice.get(record.device) ?? 0) + record.durationSeconds);
    }
    const books = [...byBook.values()].sort((a, b) => b.seconds - a.seconds);
    const list = (values: {
        title: string;
        seconds: number;
    }[]) => values.length ? <div className="breakdown">{values.map((value, index) => <div key={index}><div><span>{value.title}</span><strong>{t("{0}분", [formatMinutes(value.seconds)])}</strong></div><meter min={0} max={Math.max(...values.map(v => v.seconds))} value={value.seconds} aria-label={t("{0} 독서 시간", [value.title])}/></div>)}</div> : <Empty title={t("아직 기록이 없어요")}>{t("첫 독서를 기록하면 여기에 표시합니다.")}</Empty>;
    return <><div className="page-intro"><span className="eyebrow">{t("내 속도로 쌓아가는 독서")}</span><h1>{t("독서의 흐름")}</h1><p>{t("타이머에는 추정 시간, 수동 입력에는 직접 기록한 시간을 표시합니다.")}</p></div><div className="metric-grid"><div className="card metric"><span>{t("최근 {0}일", [period])}</span><strong>{formatMinutes(total)}<small>{t(" 분")}</small></strong></div><div className="card metric"><span>{t("목표 달성률")}</span><strong>{Math.round(complete / period * 100)}<small> %</small></strong><p>{t("{0}일 / {1}일 · 기록 없는 날 포함", [complete, period])}</p></div><div className="card metric"><span>{t("하루 평균")}</span><strong>{formatMinutes(total / period)}<small>{t(" 분")}</small></strong><p>{t("선택한 기간의 모든 날짜 기준")}</p></div></div>
    <section className="card"><div className="section-heading"><h2>{t("날짜별 독서 시간")}</h2><div className="segmented" aria-label={t("통계 기간")}>{[7, 30].map(n => <button key={n} aria-pressed={period === n} className={period === n ? 'selected' : ''} onClick={() => setPeriod(n)}>{t("{0}일", [n])}</button>)}</div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={days} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={25}/><YAxis width={45} tickLine={false} axisLine={false} unit={t("분")}/><Tooltip formatter={value => [t("{0}분", [Number(value).toLocaleString(locale)]), t("독서")]} labelFormatter={label => `${label}`}/><ReferenceLine y={state.settings.goalMinutes} stroke="var(--accent)" strokeDasharray="5 5" label={{ value: t("현재 목표"), position: 'insideTopRight', fill: 'var(--muted)' }}/><Line type="monotone" dataKey="minutes" stroke="var(--green)" strokeWidth={3} dot={period === 7} activeDot={{ r: 5 }} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><details><summary>{t("날짜별 독서 시간 보기")}</summary><div className="table-scroll"><table><thead><tr><th>{t("날짜")}</th><th>{t("독서")}</th><th>{t("당시 목표")}</th><th>{t("달성")}</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{dateText(day.date)}</td><td>{t("{0}분", [formatMinutes(day.seconds)])}</td><td>{t("{0}분", [day.goal])}</td><td>{day.complete ? t("달성") : t("미달성")}</td></tr>)}</tbody></table></div></details></section>
    <section className="card"><div className="section-heading"><h2>{t("독서 달력")}</h2><span className="muted">{t("최근 13주 · 독서 당시 날짜 기준")}</span></div><div className="heatmap" role="list" aria-label={t("날짜별 독서 달력")}>{calendar.map(day => <div key={day.date} role="listitem" tabIndex={0} title={t("{0}: {1}분 / 목표 {2}분", [dateText(day.date), formatMinutes(day.seconds), day.goal])} aria-label={t("{0}, {1}분, {2}", [dateText(day.date), formatMinutes(day.seconds), day.complete ? t("목표 달성") : t("목표 미달성")])} className={`heat ${day.complete ? 'level-2' : day.seconds > 0 ? 'level-1' : ''}`}/>)}</div><div className="heat-legend"><span>{t("기록 없음")}</span><i className="heat"/><i className="heat level-1"/><i className="heat level-2"/><span>{t("목표 달성")}</span></div></section><div className="two-columns"><section className="card"><h2>{t("책별 누적 시간")}</h2>{list(books)}</section><section className="card"><h2>{t("기기별 누적 시간")}</h2>{list([...byDevice.entries()].map(([device, seconds]) => ({ title: t(deviceNames[device as Session['device']]), seconds })))}</section></div></>;
}
function BookForm({ initial, run, close, busy }: {
    initial?: Book;
    run: Run;
    close: () => void;
    busy: boolean;
}) {
    const { t } = useI18n();
    const now = new Date().toISOString();
    const [book, setBook] = useState<Book>(initial ?? { id: crypto.randomUUID(), title: '', author: '', url: '', status: 'planned', notes: '', createdAt: now, updatedAt: now });
    const change = <K extends keyof Book>(key: K, value: Book[K]) => setBook(old => ({ ...old, [key]: value }));
    const submit = async (e: FormEvent) => { e.preventDefault(); if (await run({ type: 'SAVE_BOOK', book }, t("책을 저장했습니다.")))
        close(); };
    return <Modal title={initial ? t("책 수정") : t("서재에 책 추가하기")} close={close}><form onSubmit={e => void submit(e)}><Field label={t("책 제목")}><input autoComplete="off" required maxLength={300} value={book.title} onChange={e => change('title', e.target.value)}/></Field><Field label={t("저자 (선택)")}><input maxLength={200} value={book.author} onChange={e => change('author', e.target.value)}/></Field><Field label={t("Play Books 리더 주소 (선택)")} hint={t("Play Books에서 책을 열고 주소창의 /books/reader?id=… 주소를 복사하세요. 종이책을 등록할 때는 비워 둬도 됩니다.")}><input type="url" placeholder="https://play.google.com/books/reader?id=…" maxLength={2048} value={book.url} onChange={e => change('url', e.target.value)}/></Field><Field label={t("독서 상태")}><select value={book.status} onChange={e => change('status', e.target.value as Book['status'])}>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></Field><Field label={t("메모 (선택)")}><textarea maxLength={4000} rows={3} value={book.notes} onChange={e => change('notes', e.target.value)}/></Field><div className="actions end"><button type="button" onClick={close}>{t("취소")}</button><button className="primary" disabled={busy}>{t("저장")}</button></div></form></Modal>;
}
function Library(props: SharedProps & {
    edit: (book?: Book) => void;
    history: (bookId: string) => void;
}) {
    const { t } = useI18n();
    const [importing, setImporting] = useState(false);
    const closeImport = useCallback(() => setImporting(false), []);
    const { state, edit, history, run, busy } = props;
    const [filter, setFilter] = useState('all');
    const books = state.books.filter(b => !b.archivedAt && (filter === 'all' || b.status === filter));
    return <><div className="page-intro row"><div><span className="eyebrow">{t("다시 펼치고 싶은 책들")}</span><h1>{t("내 서재")}</h1><p>{t("계정에 연결하지 않고 내가 고른 책만 담습니다.")}</p></div><div className="actions"><button disabled={busy} onClick={() => setImporting(true)}>{t("Play Books에서 가져오기")}</button><button className="primary" onClick={() => edit()}>{t("＋ 책 추가")}</button></div></div>{importing && <LibraryImport state={state} run={run} close={closeImport}/>}<div className="filter-row"><label>{t("독서 상태 ")}<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("전체")}</option>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></label><span className="muted">{t("{0}권", [books.length])}</span></div>{books.length ? <div className="book-grid">{books.map((book, index) => <article key={book.id} className="card book-card"><div className={`book-spine tone-${index % 3}`} aria-hidden="true"><span>READ<br />CHIME</span><span>▤</span></div><div className="book-body"><div className="book-badges"><span className="pill">{t(statusNames[book.status])}</span>{state.settings.currentBookId === book.id && <span className="pill live">{t("현재 책")}</span>}</div><h2>{book.title}</h2><p className="muted">{book.author || t("저자 정보 없음")}</p><p className="book-note">{book.notes}</p><div className="actions"><button disabled={busy} onClick={() => void run({ type: 'SELECT_BOOK', id: book.id }, t("현재 책으로 선택했습니다."))}>{t("현재 책으로 선택")}</button><button disabled={busy || !book.url} onClick={() => void run({ type: 'OPEN_BOOK', id: book.id })}>{t("책 열기 ↗")}</button></div><div className="actions book-links"><button className="text-button" onClick={() => history(book.id)}>{t("기록 보기")}</button><button className="text-button" onClick={() => edit(book)}>{t("수정")}</button><button className="text-button danger" disabled={busy} onClick={() => { if (confirm(t("‘{0}’을 서재에서 제거할까요? 독서 기록은 보존합니다.", [book.title])))
        void run({ type: 'DELETE_BOOK', id: book.id }, t("서재에서 책을 제거했습니다. 독서 기록은 그대로 보존했습니다.")); }}>{t("서재에서 제거")}</button></div></div></article>)}</div> : <section className="card"><Empty title={t("서재에 첫 책을 담아 보세요")}>{t("책을 추가하세요. Play Books 주소가 없어도 종이책이나 태블릿에서 읽은 책을 기록할 수 있습니다.")}</Empty><div className="actions center"><button onClick={() => edit()}>{t("첫 책 추가하기")}</button></div></section>}</>;
}
function SessionForm({ initial, state, run, close, busy }: SharedProps & {
    initial?: Session;
    close: () => void;
}) {
    const { t, minutes: formatMinutes } = useI18n();
    const [bookId, setBookId] = useState(initial?.bookId ?? recommend(state)?.id ?? state.books.find(b => !b.archivedAt)?.id ?? '');
    const [date, setDate] = useState(initial?.localDate ?? localDate());
    const [minutes, setMinutes] = useState(initial ? String(initial.durationSeconds / 60) : '5');
    const [device, setDevice] = useState<Session['device']>(initial?.device ?? 'tablet');
    const [notes, setNotes] = useState(initial?.notes ?? '');
    const [acknowledged, setAcknowledged] = useState(!!initial);
    const already = allReadings(state).filter(s => s.localDate === date && s.id !== initial?.id).reduce((v, s) => v + s.durationSeconds, 0);
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const book = state.books.find(b => b.id === bookId);
        if (!book)
            return;
        const now = new Date().toISOString();
        const anchor = new Date(`${date}T00:00:00`).toISOString();
        const session: Session = { id: initial?.id ?? crypto.randomUUID(), bookId, bookTitle: initial?.bookId === bookId ? initial.bookTitle : book.title,
            startedAt: initial?.localDate === date ? initial.startedAt : anchor, endedAt: initial?.localDate === date ? initial.endedAt : anchor,
            durationSeconds: Math.round(Number(minutes) * 60), source: initial?.source ?? 'manual', measurement: initial?.measurement ?? 'entry',
            device, notes, localDate: date, timezone: initial?.localDate === date ? initial.timezone : currentTimezone(),
            createdAt: initial?.createdAt ?? now, updatedAt: now, corrected: !!initial && initial.measurement === 'timer', interrupted: initial?.interrupted ?? false, groupId: initial?.groupId };
        if (await run({ type: 'SAVE_SESSION', session }, initial ? t("독서 기록을 수정했습니다.") : t("독서 기록을 추가했습니다.")))
            close();
    };
    return <Modal title={initial ? t("독서 기록 수정") : t("독서 시간 기록하기")} close={close}><form onSubmit={e => void submit(e)}><Field label={t("읽은 책")}><select required value={bookId} onChange={e => setBookId(e.target.value)}><option value="" disabled>{t("책을 선택하세요")}</option>{state.books.filter(b => !b.archivedAt || b.id === initial?.bookId).map(b => <option key={b.id} value={b.id}>{b.title}{b.archivedAt ? t(" (서재에서 제거됨)") : ''}</option>)}</select></Field>{!state.books.some(b => !b.archivedAt) && !initial && <p className="help">{t("내 서재에서 책을 먼저 추가하세요.")}</p>}<div className="two-columns"><Field label={t("읽은 날짜")}><input type="date" required max={localDate()} value={date} onChange={e => setDate(e.target.value)}/></Field><Field label={t("읽은 시간 (분)")}><input type="number" required min={1 / 60} max={1440} step="any" value={minutes} onChange={e => setMinutes(e.target.value)}/></Field></div><Field label={t("기기")}><select value={device} onChange={e => setDevice(e.target.value as Session['device'])}>{Object.entries(deviceNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></Field><Field label={t("메모 (선택)")}><textarea maxLength={4000} rows={3} value={notes} onChange={e => setNotes(e.target.value)}/></Field><div className="info-box">{t("선택한 날짜에 이미 기록한 시간: ")}<strong>{t("{0}분", [formatMinutes(already)])}</strong>{initial?.measurement === 'timer' && <p>{t("추정 타이머 기록을 보정합니다. 수정 표시와 원래 측정 유형은 그대로 남습니다.")}</p>}</div>{!initial && <label className="check"><input type="checkbox" required checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>{t("이미 기록된 시간과 겹치지 않는 추가 독서입니다.")}</label>}<p className="help">{t("날짜와 분량만으로는 실제로 읽은 시간이 중복되는지 판별할 수 없습니다. 이 기록은 현재 Firefox 프로필에만 저장됩니다.")}</p><div className="actions end"><button type="button" onClick={close}>{t("취소")}</button><button className="primary" disabled={busy || !bookId}>{initial ? t("수정 내용 저장") : t("기록 저장")}</button></div></form></Modal>;
}
function History(props: SharedProps & {
    edit: (session?: Session) => void;
    initialBook: string;
}) {
    const { t, minutes: formatMinutes, dateText } = useI18n();
    const { state, run, busy, edit, initialBook } = props;
    const [book, setBook] = useState(initialBook);
    const [device, setDevice] = useState('');
    const [source, setSource] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const records = state.sessions.filter(s => (!book || s.bookId === book) && (!device || s.device === device) && (!source || s.measurement === source) && (!from || s.localDate >= from) && (!to || s.localDate <= to)).sort((a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt));
    const [limit, setLimit] = useState(50);
    const removed = state.books.find(b => b.id === book && b.archivedAt);
    const purgeButton = removed && <div className="info-box"><p>{t("서재에서 제거한 책입니다. 독서 기록은 그대로 남아 있습니다.")}</p><button className="text-button danger" disabled={busy} onClick={() => {
            const count = state.sessions.filter(s => s.bookId === removed.id).length;
            if (confirm(t("‘{0}’과 연결된 독서 기록 {1}개를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.", [removed.title, count])))
                void run({ type: 'PURGE_BOOK', id: removed.id, confirmed: true }, t("책과 연결된 기록을 영구 삭제했습니다.")).then(ok => { if (ok)
                    setBook(''); });
        }}>{t("이 책과 독서 기록 영구 삭제")}</button></div>;
    return <><div className="page-intro row"><div><span className="eyebrow">{t("내가 읽어 온 시간")}</span><h1>{t("독서 기록")}</h1><p>{t("1분도 기록할 수 있어요. 수정하거나 삭제하면 통계에도 바로 반영돼요.")}</p></div><button className="primary" onClick={() => edit()}>{t("＋ 독서 시간 직접 기록")}</button></div><section className="card"><div className="history-filters"><Field label={t("책")}><select value={book} onChange={e => setBook(e.target.value)}><option value="">{t("책 전체")}</option>{state.books.map(b => <option key={b.id} value={b.id}>{b.title}{b.archivedAt ? t(" (제거됨)") : ''}</option>)}</select></Field><Field label={t("기기")}><select value={device} onChange={e => setDevice(e.target.value)}><option value="">{t("기기 전체")}</option>{Object.entries(deviceNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></Field><Field label={t("기록 방식")}><select value={source} onChange={e => setSource(e.target.value)}><option value="">{t("전체")}</option><option value="timer">{t("추정 타이머")}</option><option value="entry">{t("수동 입력")}</option></select></Field><Field label={t("시작 날짜")}><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></Field><Field label={t("종료 날짜")}><input type="date" value={to} onChange={e => setTo(e.target.value)}/></Field></div><div className="section-heading"><span className="muted">{t("{0}개 기록 · {1}분", [records.length, formatMinutes(records.reduce((v, s) => v + s.durationSeconds, 0))])}</span><button className="text-button" onClick={() => { setBook(''); setDevice(''); setSource(''); setFrom(''); setTo(''); }}>{t("검색 조건 초기화")}</button></div>{purgeButton}{records.length ? <><div className="table-scroll"><table><thead><tr><th>{t("날짜 / 책")}</th><th>{t("시간")}</th><th>{t("방식 / 기기")}</th><th>{t("메모")}</th><th>{t("관리")}</th></tr></thead><tbody>{records.slice(0, limit).map(record => <tr key={record.id}><td><small>{dateText(record.localDate)}</small><strong className="table-book">{record.bookTitle}</strong></td><td className="nowrap">{t("{0}분", [formatMinutes(record.durationSeconds)])}</td><td><span className="pill">{record.measurement === 'timer' ? t("추정 타이머") : t("수동 입력")}</span><small>{t(deviceNames[record.device])}{record.corrected ? t(" · 보정됨") : ''}{record.interrupted ? t(" · 중단됨") : ''}</small></td><td className="record-notes">{record.notes || '—'}</td><td><div className="actions nowrap"><button className="text-button" onClick={() => edit(record)}>{t("수정")}</button><button className="text-button danger" disabled={busy} onClick={() => { if (confirm(t("이 독서 기록을 삭제할까요? 통계에서도 제외됩니다.")))
        void run({ type: 'DELETE_SESSION', id: record.id }, t("기록을 삭제했습니다.")); }}>{t("삭제")}</button></div></td></tr>)}</tbody></table></div>{limit < records.length && <button onClick={() => setLimit(limit + 50)}>{t("50개 더 보기")}</button>}</> : <Empty title={t("조건에 맞는 독서 기록이 없어요")}>{t("검색 조건을 바꾸거나 새 독서를 기록해 보세요.")}</Empty>}</section></>;
}
function Backups({ state, run, busy }: SharedProps) {
    const { t, errorText } = useI18n();
    const [json, setJson] = useState('');
    const [preview, setPreview] = useState<ImportPreview>();
    const [revision, setRevision] = useState(0);
    const [mode, setMode] = useState<'merge' | 'replace'>('merge');
    const [selected, setSelected] = useState<string[]>([]);
    const [settings, setSettings] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const download = async () => {
        try {
            const reply = await request({ type: 'EXPORT' });
            const blob = new Blob([reply.json!], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `ReadChime-${localDate()}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("백업을 내보내지 못했습니다."));
        }
    };
    const readFile = async (file?: File) => {
        setPreview(undefined);
        setError('');
        setSelected([]);
        setConfirmed(false);
        if (!file)
            return;
        if (file.size > 25 * 1024 * 1024) {
            setError(t("25MB 이하의 백업을 선택하세요."));
            return;
        }
        try {
            const contents = await file.text();
            const reply = await request({ type: 'PREVIEW_IMPORT', json: contents });
            setJson(contents);
            setPreview(reply.preview);
            setRevision(reply.snapshot!.state.revision);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("파일을 읽지 못했습니다."));
        }
    };
    return <section className="card"><h2>{t("백업과 복원")}</h2><p className="muted">{t("서재·설정·완료된 독서 기록을 JSON으로 내보냅니다. 진행 중인 타이머가 있다면 먼저 종료하세요.")}</p><p className="help">{t("확장을 삭제하거나 Firefox 프로필을 지우면 데이터가 사라질 수 있습니다. 백업에는 책 제목과 메모가 평문으로 들어 있습니다.")}</p><div className="actions"><button disabled={busy} onClick={() => void download()}>{t("JSON 백업 내려받기")}</button><label className="file-button">{t("백업 파일 선택")}<input type="file" accept=".json,application/json" onChange={e => void readFile(e.target.files?.[0])}/></label></div>{error && <p role="alert" className="error-box">{errorText(error)}</p>}{preview && <div className="backup-preview"><h3>{t("가져오기 미리보기")}</h3><p>{t("새 책 {0}권 · 새 기록 {1}개 · 동일 {2}개 · 충돌 {3}개", [preview.addedBooks, preview.addedSessions, preview.identical, preview.conflicts.length])}</p><Field label={t("가져오기 방식")}><select value={mode} onChange={e => { setMode(e.target.value as 'merge' | 'replace'); setConfirmed(false); }}><option value="merge">{t("기존 데이터와 병합")}</option><option value="replace">{t("전체 교체")}</option></select></Field>{mode === 'merge' ? <><label className="check"><input type="checkbox" checked={settings} onChange={e => setSettings(e.target.checked)}/>{t("가져온 설정과 날짜별 목표 적용 (기본: 현재 설정 유지)")}</label>{preview.conflicts.length > 0 && <><p className="help">{t("따로 선택하지 않으면 현재 값을 보존합니다. 가져온 값으로 바꿀 항목만 선택하세요.")}</p><div className="conflict-list">{preview.conflicts.map(item => <label className="check" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))}/>{item.kind === 'book' ? t("책") : t("기록")} · {item.label}</label>)}</div></>}</> : <p className="error-box">{t("현재 책 {0}권과 기록 {1}개를 가져온 데이터로 모두 교체합니다. 복원 전에 현재 데이터를 백업하기를 권장합니다.", [state.books.length, state.sessions.length])}</p>}<label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{mode === 'replace' ? t("현재 데이터 전체를 교체한다는 점을 확인했습니다.") : t("미리보기와 충돌 처리 방식을 확인했습니다.")}</label><button className={mode === 'replace' ? 'danger-button' : 'primary'} disabled={busy || !confirmed || !!state.active} onClick={async () => { if (await run({ type: 'IMPORT', json, mode, useImportedIds: selected, includeSettings: settings, confirmed, expectedRevision: revision }, t("백업을 가져왔습니다."))) {
        setPreview(undefined);
        setJson('');
    } }}>{mode === 'replace' ? t("전체 데이터 교체") : t("데이터 병합")}</button></div>}</section>;
}
function SettingsPage(props: SharedProps & {
    nextAlarm: number | null;
}) {
    const { t, locale } = useI18n();
    const { state, run, busy, nextAlarm } = props;
    const [settings, setSettings] = useState<Settings>(state.settings);
    const settingsKey = JSON.stringify(state.settings);
    useEffect(() => { setSettings(JSON.parse(settingsKey) as Settings); }, [settingsKey]);
    const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(old => ({ ...old, [key]: value }));
    return <><div className="page-intro"><span className="eyebrow">{t("편안하게 이어 가는 독서 습관")}</span><h1>{t("설정")}</h1><p>{t("모든 데이터는 현재 Firefox 프로필에 보관됩니다.")}</p></div><form className="card" onSubmit={e => { e.preventDefault(); void run({ type: 'SAVE_SETTINGS', settings }, "설정을 저장했습니다."); }}><h2>{t("매일의 독서 목표")}</h2><label className="check"><input type="checkbox" checked={settings.reminderEnabled} onChange={e => change('reminderEnabled', e.target.checked)}/>{t("매일 독서 알림 받기")}</label><div className="two-columns"><Field label={t("알림 시간 (기기 현지 시간)")}><input type="time" required value={`${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`} onChange={e => { const [hour, minute] = e.target.value.split(':').map(Number); setSettings(old => ({ ...old, hour, minute })); }}/></Field><Field label={t("하루 목표 (분)")}><input type="number" required min={1} max={1440} step={1} value={settings.goalMinutes} onChange={e => change('goalMinutes', Number(e.target.value))}/></Field></div><Field label={t("알림 방식")}><select value={settings.reminderMode} onChange={e => change('reminderMode', e.target.value as Settings['reminderMode'])}><option value="direct">{t("바로 열기 · 책 탭을 열거나 앞으로 가져오기")}</option><option value="gentle">{t("부드러운 알림 · 알림을 누르면 책 열기")}</option></select></Field><div className="two-columns"><Field label={t("다시 알림 간격 (분)")}><input type="number" required min={1} max={120} value={settings.snoozeMinutes} onChange={e => change('snoozeMinutes', Number(e.target.value))}/></Field><Field label={t("놓친 알림의 유예 시간 (분)")}><input type="number" required min={0} max={720} value={settings.graceMinutes} onChange={e => change('graceMinutes', Number(e.target.value))}/></Field></div><p className="help">{t("목표를 달성했거나 이미 독서 시간을 측정 중이면 정기 알림을 생략합니다. 놓친 알림은 유예 시간 안에만 보내며 자정을 넘기면 만료합니다. Firefox가 꺼져 있는 동안에는 동작하지 않습니다.")}</p><h2>{t("독서 시간 측정과 화면")}</h2><label className="check"><input type="checkbox" checked={settings.readerPrompt} onChange={e => change('readerPrompt', e.target.checked)}/>{t("Play Books에서 책을 열면 시작 안내 팝업 표시")}</label><p className="help">{t("URL과 리더 바깥 구조만 확인합니다. 책 본문·Google 계정 정보는 읽지 않습니다. 서재 목록은 대시보드에서 요청할 때만 읽습니다. 주의 집중은 측정할 수 없으며 절전·중단 뒤에는 직접 시작해야 합니다.")}</p><Field label={t('언어 / Language')}><select name="language" value={settings.language} onChange={e => change('language', e.target.value as Settings['language'])}><option value="system">{t('시스템 (Firefox 언어)')}</option><option value="ko">한국어</option><option value="en">English</option></select></Field><p className="help">{t('언어를 선택한 뒤 설정을 저장하세요. 시스템 설정은 Firefox가 한국어이면 한국어, 그 외에는 영어를 사용합니다.')}</p><Field label={t("화면 테마")}><select value={settings.theme} onChange={e => change('theme', e.target.value as Settings['theme'])}><option value="system">{t("시스템 설정")}</option><option value="light">{t("밝은 화면")}</option><option value="dark">{t("어두운 화면")}</option></select></Field><div className="actions"><button className="primary" disabled={busy}>{t("설정 저장")}</button><button type="button" disabled={busy} onClick={() => void run({ type: 'TEST_REMINDER' }, t("저장된 설정으로 알림을 시험했습니다."))}>{t("저장된 설정으로 알림 시험하기")}</button></div><p className="help">{t("다음 정기 알림: {0} · 시스템 상황에 따라 지연될 수 있습니다.", [nextAlarm ? new Date(nextAlarm).toLocaleString(locale) : t("예약 없음")])}</p></form><Backups {...props}/><section className="card"><h2>{t("이 Firefox에 저장되는 데이터")}</h2><p>{t("태블릿·휴대폰·종이책으로 읽은 시간은 이 PC에서 직접 입력합니다. 다른 기기로 동기화되지 않습니다.")}</p><p className="help">{t("개발용으로 임시 설치한 확장은 Firefox를 재시작하면 해제됩니다. 매일 사용하려면 서명된 확장 설치가 필요합니다. 설치·서명·검증 절차는 프로젝트 README를 확인하세요.")}</p></section></>;
}
function Popup(props: SharedProps & {
    manual: () => void;
}) {
    const { t, minutes: formatMinutes } = useI18n();
    const { state, run, manual } = props;
    const totals = summary(state);
    return <div className="popup"><header className="popup-header"><div className="brand"><span className="brand-mark">▤</span><strong>ReadChime</strong></div><button className="text-button" onClick={() => void run({ type: 'DASHBOARD' })}>{t("대시보드 ↗")}</button></header><div className="popup-progress"><div><span className="eyebrow">{t("오늘의 독서 목표")}</span><h2>{t("{0}분 ", [formatMinutes(totals.todaySeconds)])}<span className="muted">{t("/ {0}분", [totals.goal])}</span></h2></div><Progress seconds={totals.todaySeconds} goal={totals.goal} small/></div><Timer {...props}/><div className="actions"><button className="full" onClick={manual}>{t("＋ 독서 시간 직접 기록")}</button></div><ReminderActions {...props}/><p className="local-note">{t("◉ 기록은 이 Firefox 안에만 저장됩니다")}</p></div>;
}
function App() {
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
function ErrorFallback() {
 const { t } = useI18n(document.documentElement.lang === 'ko' ? 'ko' : 'en');
 return <main className="loading"><h1>{t("화면을 표시하지 못했습니다")}</h1><p>{t("저장된 독서 기록은 그대로 유지됩니다. 화면을 다시 열어 주세요.")}</p><button onClick={() => location.reload()}>{t("다시 불러오기")}</button></main>;
}
class ErrorBoundary extends Component<{
    children: ReactNode;
}, {
    failed: boolean;
}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? <ErrorFallback/> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);



