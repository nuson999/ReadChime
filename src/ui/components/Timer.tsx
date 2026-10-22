import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { recommend, detectedBook } from '../../domain/books';
import { clockText, localDate } from '../../domain/time';
import { ActionButton, type SharedProps } from './common';
export function Timer({ state, run, detection }: SharedProps) {
    const { t } = useI18n();
    const [confirmed, setConfirmed] = useState(false);
    const book = detection?.key ? detectedBook(state, detection.key) : recommend(state);
    useEffect(() => setConfirmed(false), [book?.id]);
    const active = state.active;
    const restore = !!book && (!!book.archivedAt || book.status === 'completed' || book.status === 'paused');
    const seconds = active?.buckets.reduce((v, b) => v + b.seconds, 0) ?? 0;
    return <section className="card timer-card"><div className="section-heading"><h2>{active ? t("지금 읽는 책") : detection?.key ? t("Play Books에서 감지한 책") : t("한 페이지부터 시작")}</h2><span className={`pill ${active?.status === 'running' ? 'live' : ''}`}>{active ? { running: t("● 독서 시간 측정 중"), waiting: t("책 탭으로 돌아오세요"), paused: t("일시정지") }[active.status] : t("시작 준비 완료")}</span></div>
    {active ? <><p className="timer-title">{active.bookTitle}</p><div className="timer-digits">{clockText(seconds)}</div><p className="muted">{t("추정 독서 시간 · 확인된 구간만 약 5초마다 합산")}</p><div className="actions"><ActionButton onClick={() => run({ type: active.status === 'paused' ? 'RESUME' : 'PAUSE' })}>{active.status === 'paused' ? t("이어서 읽기") : t("일시정지")}</ActionButton><ActionButton className="primary" onClick={() => run({ type: 'STOP' }, t("확인된 독서 시간을 저장했습니다."))}>{t("종료하고 저장")}</ActionButton></div>{active.status !== 'running' && <p className="help">{t("책이 보이면 다른 앱에서 메모해도 측정합니다. 책을 숨겼다가 5초 안에 돌아오면 자동으로 이어지고, 넘기면 읽기 재개를 눌러 주세요.")}</p>}</>
            : <><h3>{book?.pendingTitle ? t("제목 확인 중") : book?.title ?? t("오늘 읽을 책을 골라 보세요")}</h3>{book?.pendingTitle && <small className="muted">{detection?.key}</small>}<p className="muted">{book?.author || t("책 한 권과 짧은 시간이면 충분해요.")}</p>{restore && <p className="help">{t("완독·잠시 멈춤·보관 상태를 유지하고 있습니다. 읽기 재개를 누르면 다시 기록합니다.")}</p>}<div className="actions"><ActionButton className="primary" disabled={!book?.url} onClick={() => book && run({ type: 'START', id: book.id, confirm: confirmed, restore })}>{t(restore ? "읽기 재개" : "▶ 독서 시작")}</ActionButton><ActionButton onClick={() => run({ type: 'OPEN_BOOK', id: book?.id })}>{book?.url ? t("책 열기") : t("서재에서 책 고르기")}</ActionButton></div>{book?.url && !detection?.supported && <label className="check compact"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t("이 탭에서 실제로 읽고 있습니다 ")}<span className="muted">{t("(리더 감지에 실패한 경우)")}</span></label>}<p className="help">{t("독서 시간은 시작 버튼을 누른 뒤부터 기록합니다. 다른 책을 열면 새 책에서 다시 시작해 주세요.")}</p></>}
  </section>;
}
export function ReminderActions({ state, run }: SharedProps) {
    const { t, locale } = useI18n();
    const today = localDate();
    return <div className="reminder-actions"><span className="muted">{state.reminder.skipped.includes(today) ? t("오늘 알림은 건너뜁니다.") : state.reminder.snooze ? t("{0}에 다시 알림", [new Date(state.reminder.snooze.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })]) : `${state.settings.hour.toString().padStart(2, '0')}:${state.settings.minute.toString().padStart(2, '0')} · ${state.settings.reminderEnabled ? t("독서 알림") : t("알림 꺼짐")}`}</span><div className="actions"><ActionButton className="text-button" onClick={() => run({ type: 'SNOOZE' }, t("다시 알림을 예약했습니다."))}>{t("{0}분 뒤 알림", [state.settings.snoozeMinutes])}</ActionButton><ActionButton className="text-button" onClick={() => run({ type: 'SKIP' }, t("오늘 정기 알림을 건너뜁니다."))}>{t("오늘 알림 건너뛰기")}</ActionButton></div></div>;
}
