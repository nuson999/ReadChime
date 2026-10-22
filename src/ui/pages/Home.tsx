import { useI18n } from '../i18n';
import { dailySeries, summary } from '../../domain/statistics';
import { type Section, Progress, type SharedProps } from '../components/common';
import { Timer, ReminderActions } from '../components/Timer';
export function Home(props: SharedProps & {
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
