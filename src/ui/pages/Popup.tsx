import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { summary } from '../../domain/statistics';
import { Progress, type SharedProps } from '../components/common';
import { Timer, ReminderActions } from '../components/Timer';
export function Popup(props: SharedProps) {
    const { t } = useI18n();
    const { state, run } = props;
    const totals = summary(state);
    return <div className="popup"><header className="popup-header"><div className="brand"><span className="brand-mark"><Icon name="book" size={22}/></span><strong>ReadChime</strong></div><button className="text-button" onClick={() => void run({ type: 'DASHBOARD' })}>{t("대시보드 ↗")}</button></header><div className="popup-progress"><span className="eyebrow">{t("오늘의 독서 목표")}</span><Progress seconds={totals.todaySeconds} goal={totals.goal} small/></div><Timer {...props} compact/><ReminderActions {...props}/><p className="local-note"><Icon name="lock" size={13}/>{t("기록은 이 Firefox 안에만 저장됩니다")}</p></div>;
}
