import { useI18n } from '../i18n';
import { useState, type FormEvent } from 'react';
import { type Session } from '../../domain/model';
import { recommend } from '../../domain/books';
import { currentTimezone, localDate } from '../../domain/time';
import { allReadings } from '../../domain/statistics';
import { Modal } from '../Modal';
import { deviceNames, Field, type SharedProps } from './common';
export function SessionForm({ initial, state, run, close, busy }: SharedProps & {
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
