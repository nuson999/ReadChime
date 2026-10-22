import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { summary } from '../../domain/statistics';
import { Progress, type SharedProps } from '../components/common';
import { Timer, ReminderActions } from '../components/Timer';
export function Popup(props: SharedProps & {
    manual: () => void;
}) {
    const { t, minutes: formatMinutes } = useI18n();
    const { state, run, manual } = props;
    const totals = summary(state);
    return <div className="popup"><header className="popup-header"><div className="brand"><span className="brand-mark"><Icon name="book" size={22}/></span><strong>ReadChime</strong></div><button className="text-button" onClick={() => void run({ type: 'DASHBOARD' })}>{t("대시보드 ↗")}</button></header><div className="popup-progress"><div><span className="eyebrow">{t("오늘의 독서 목표")}</span><h2>{t("{0}분 ", [formatMinutes(totals.todaySeconds)])}<span className="muted">{t("/ {0}분", [totals.goal])}</span></h2></div><Progress seconds={totals.todaySeconds} goal={totals.goal} small/></div><Timer {...props}/><div className="actions"><button className="full" onClick={manual}>{t("＋ 독서 시간 직접 기록")}</button></div><ReminderActions {...props}/><p className="local-note"><Icon name="lock" size={13}/>{t("기록은 이 Firefox 안에만 저장됩니다")}</p></div>;
}
