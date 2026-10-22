import { useI18n } from '../i18n';
import { useRef, useState, type KeyboardEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type State, type Session } from '../../domain/model';
import { allReadings, dailySeries } from '../../domain/statistics';
import { deviceNames, Empty } from '../components/common';
export function Stats({ state }: {
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
    <section className="card"><div className="section-heading"><h2>{t("독서 달력")}</h2><span className="muted">{t("최근 13주 · 독서 당시 날짜 기준")}</span></div><Heatmap days={calendar}/><div className="heat-legend"><span>{t("기록 없음")}</span><i className="heat"/><i className="heat level-1"/><i className="heat level-2"/><span>{t("목표 달성")}</span></div></section><div className="two-columns"><section className="card"><h2>{t("책별 누적 시간")}</h2>{list(books)}</section><section className="card"><h2>{t("기기별 누적 시간")}</h2>{list([...byDevice.entries()].map(([device, seconds]) => ({ title: t(deviceNames[device as Session['device']]), seconds })))}</section></div></>;
}
type CalendarDay = ReturnType<typeof dailySeries>[number];
/** 13-week calendar with one tab stop; arrow keys move by day (up/down) or week (left/right). */
function Heatmap({ days }: {
    days: CalendarDay[];
}) {
    const { t, minutes: formatMinutes, dateText } = useI18n();
    const [focused, setFocused] = useState(days.length - 1);
    const cells = useRef<(HTMLDivElement | null)[]>([]);
    const index = Math.min(focused, days.length - 1);
    const describe = (day: CalendarDay) => t("{0}, {1}분, {2}", [dateText(day.date), formatMinutes(day.seconds), day.complete ? t("목표 달성") : t("목표 미달성")]);
    const move = (next: number) => { const target = Math.max(0, Math.min(days.length - 1, next)); setFocused(target); cells.current[target]?.focus(); };
    const keydown = (event: KeyboardEvent) => {
        const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
        if (step !== undefined) move(index + step);
        else if (event.key === 'Home') move(0);
        else if (event.key === 'End') move(days.length - 1);
        else return;
        event.preventDefault();
    };
    const current = days[index];
    return <><div className="heatmap" role="list" aria-label={t("날짜별 독서 달력")} aria-describedby="heatmap-hint" onKeyDown={keydown}>{days.map((day, i) => <div key={day.date} ref={element => { cells.current[i] = element; }} role="listitem" tabIndex={i === index ? 0 : -1} aria-label={describe(day)} onFocus={() => setFocused(i)} onMouseEnter={() => setFocused(i)} className={`heat ${day.complete ? 'level-2' : day.seconds > 0 ? 'level-1' : ''}${i === index ? ' selected' : ''}`}/>)}</div>
    <p className="heat-caption" aria-hidden="true">{current && t("{0}: {1}분 / 목표 {2}분", [dateText(current.date), formatMinutes(current.seconds), current.goal])}</p><p id="heatmap-hint" className="sr-only">{t("화살표 키로 날짜를 이동합니다.")}</p></>;
}
