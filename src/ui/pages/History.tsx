import { useI18n } from '../i18n';
import { useState } from 'react';
import { type Session } from '../../domain/model';
import { ActionButton, deviceNames, Field, Empty, type SharedProps } from '../components/common';
export function History(props: SharedProps & {
    edit: (session?: Session) => void;
    initialBook: string;
}) {
    const { t, minutes: formatMinutes, dateText } = useI18n();
    const { state, run, edit, initialBook } = props;
    const [book, setBook] = useState(initialBook);
    const [device, setDevice] = useState('');
    const [source, setSource] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const records = state.sessions.filter(s => (!book || s.bookId === book) && (!device || s.device === device) && (!source || s.measurement === source) && (!from || s.localDate >= from) && (!to || s.localDate <= to)).sort((a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt));
    const [limit, setLimit] = useState(50);
    const removed = state.books.find(b => b.id === book && b.archivedAt);
    const purgeButton = removed && <div className="info-box"><p>{t("서재에서 제거한 책입니다. 독서 기록은 그대로 남아 있습니다.")}</p><ActionButton className="text-button danger" onClick={() => {
            const count = state.sessions.filter(s => s.bookId === removed.id).length;
            if (confirm(t("‘{0}’과 연결된 독서 기록 {1}개를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.", [removed.title, count])))
                return run({ type: 'PURGE_BOOK', id: removed.id, confirmed: true }, t("책과 연결된 기록을 영구 삭제했습니다.")).then(ok => { if (ok)
                    setBook(''); });
        }}>{t("이 책과 독서 기록 영구 삭제")}</ActionButton></div>;
    return <><div className="page-intro row"><div><span className="eyebrow">{t("내가 읽어 온 시간")}</span><h1>{t("독서 기록")}</h1><p>{t("1분도 기록할 수 있어요. 수정하거나 삭제하면 통계에도 바로 반영돼요.")}</p></div><button className="primary" onClick={() => edit()}>{t("＋ 독서 시간 직접 기록")}</button></div><section className="card"><div className="history-filters"><Field label={t("책")}><select value={book} onChange={e => setBook(e.target.value)}><option value="">{t("책 전체")}</option>{state.books.map(b => <option key={b.id} value={b.id}>{b.title}{b.archivedAt ? t(" (제거됨)") : ''}</option>)}</select></Field><Field label={t("기기")}><select value={device} onChange={e => setDevice(e.target.value)}><option value="">{t("기기 전체")}</option>{Object.entries(deviceNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></Field><Field label={t("기록 방식")}><select value={source} onChange={e => setSource(e.target.value)}><option value="">{t("전체")}</option><option value="timer">{t("추정 타이머")}</option><option value="entry">{t("수동 입력")}</option></select></Field><Field label={t("시작 날짜")}><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></Field><Field label={t("종료 날짜")}><input type="date" value={to} onChange={e => setTo(e.target.value)}/></Field></div><div className="section-heading"><span className="muted">{t("{0}개 기록 · {1}분", [records.length, formatMinutes(records.reduce((v, s) => v + s.durationSeconds, 0))])}</span><button className="text-button" onClick={() => { setBook(''); setDevice(''); setSource(''); setFrom(''); setTo(''); }}>{t("검색 조건 초기화")}</button></div>{purgeButton}{records.length ? <><div className="table-scroll"><table><thead><tr><th>{t("날짜 / 책")}</th><th>{t("시간")}</th><th>{t("방식 / 기기")}</th><th>{t("메모")}</th><th>{t("관리")}</th></tr></thead><tbody>{records.slice(0, limit).map(record => <tr key={record.id}><td><small>{dateText(record.localDate)}</small><strong className="table-book">{record.bookTitle}</strong></td><td className="nowrap">{t("{0}분", [formatMinutes(record.durationSeconds)])}</td><td><span className="pill">{record.measurement === 'timer' ? t("추정 타이머") : t("수동 입력")}</span><small>{t(deviceNames[record.device])}{record.corrected ? t(" · 보정됨") : ''}{record.interrupted ? t(" · 중단됨") : ''}</small></td><td className="record-notes">{record.notes || '—'}</td><td><div className="actions nowrap"><button className="text-button" onClick={() => edit(record)}>{t("수정")}</button><ActionButton className="text-button danger" onClick={() => { if (confirm(t("이 독서 기록을 삭제할까요? 통계에서도 제외됩니다.")))
        return run({ type: 'DELETE_SESSION', id: record.id }, t("기록을 삭제했습니다.")); }}>{t("삭제")}</ActionButton></div></td></tr>)}</tbody></table></div>{limit < records.length && <button onClick={() => setLimit(limit + 50)}>{t("50개 더 보기")}</button>}</> : <Empty title={t("조건에 맞는 독서 기록이 없어요")}>{t("검색 조건을 바꾸거나 새 독서를 기록해 보세요.")}</Empty>}</section></>;
}
