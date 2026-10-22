import { useI18n } from '../i18n';
import { type ReactNode } from 'react';
import { type State, type Book, type Session } from '../../domain/model';
import { type Detection } from '../../domain/detector';
import { type Command } from '../../shared/messages';
export const sections = { home: '홈', stats: '통계', library: '내 서재', history: '독서 기록', settings: '설정' } as const;
export type Section = keyof typeof sections;
export const statusNames: Record<Book['status'], string> = { planned: '읽을 책', reading: '읽는 중', completed: '완독', paused: '잠시 멈춤' };
export const deviceNames: Record<Session['device'], string> = { desktop: '데스크톱', tablet: '태블릿', smartphone: '스마트폰', paper: '종이책', other: '기타' };
export const navIcons = { home: '⌂', stats: '▥', library: '▤', history: '◷', settings: '⚙' };
export const isPopup = location.pathname.endsWith('popup.html');
export function Field({ label, children, hint }: {
    label: string;
    children: ReactNode;
    hint?: string;
}) {
    return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Empty({ title, children }: {
    title: string;
    children: ReactNode;
}) {
    return <div className="empty"><span className="empty-symbol" aria-hidden="true">▤</span><h3>{title}</h3><p>{children}</p></div>;
}
export function Progress({ seconds, goal, small = false }: {
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
export type Run = (command: Command, notice?: string) => Promise<boolean>;
export interface SharedProps {
    state: State;
    run: Run;
    busy: boolean;
    detection?: Detection;
}
