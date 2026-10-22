import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { type Settings } from '../../domain/model';
import { localDate } from '../../domain/time';
import { type ImportPreview } from '../../shared/messages';
import { request } from '../client';
import { ActionButton, Field, type SharedProps } from '../components/common';
export function Backups({ state, run }: SharedProps) {
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
    return <section className="card"><h2>{t("백업과 복원")}</h2><p className="muted">{t("서재·설정·완료된 독서 기록을 JSON으로 내보냅니다. 진행 중인 타이머가 있다면 먼저 종료하세요.")}</p><p className="help">{t("확장을 삭제하거나 Firefox 프로필을 지우면 데이터가 사라질 수 있습니다. 백업에는 책 제목과 메모가 평문으로 들어 있습니다.")}</p><div className="actions"><ActionButton onClick={() => download()}>{t("JSON 백업 내려받기")}</ActionButton><label className="file-button">{t("백업 파일 선택")}<input type="file" accept=".json,application/json" onChange={e => void readFile(e.target.files?.[0])}/></label></div>{error && <p role="alert" className="error-box">{errorText(error)}</p>}{preview && <div className="backup-preview"><h3>{t("가져오기 미리보기")}</h3><p>{t("새 책 {0}권 · 새 기록 {1}개 · 동일 {2}개 · 충돌 {3}개", [preview.addedBooks, preview.addedSessions, preview.identical, preview.conflicts.length])}</p><Field label={t("가져오기 방식")}><select value={mode} onChange={e => { setMode(e.target.value as 'merge' | 'replace'); setConfirmed(false); }}><option value="merge">{t("기존 데이터와 병합")}</option><option value="replace">{t("전체 교체")}</option></select></Field>{mode === 'merge' ? <><label className="check"><input type="checkbox" checked={settings} onChange={e => setSettings(e.target.checked)}/>{t("가져온 설정과 날짜별 목표 적용 (기본: 현재 설정 유지)")}</label>{preview.conflicts.length > 0 && <><p className="help">{t("따로 선택하지 않으면 현재 값을 보존합니다. 가져온 값으로 바꿀 항목만 선택하세요.")}</p><div className="conflict-list">{preview.conflicts.map(item => <label className="check" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))}/>{item.kind === 'book' ? t("책") : t("기록")} · {item.label}</label>)}</div></>}</> : <p className="error-box">{t("현재 책 {0}권과 기록 {1}개를 가져온 데이터로 모두 교체합니다. 복원하기 전에 현재 데이터를 백업해 두는 것이 좋습니다.", [state.books.length, state.sessions.length])}</p>}<label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{mode === 'replace' ? t("현재 데이터 전체를 교체한다는 점을 확인했습니다.") : t("미리보기와 충돌 처리 방식을 확인했습니다.")}</label><ActionButton className={mode === 'replace' ? 'danger-button' : 'primary'} disabled={!confirmed || !!state.active} onClick={async () => { if (await run({ type: 'IMPORT', json, mode, useImportedIds: selected, includeSettings: settings, confirmed, expectedRevision: revision }, t("백업을 가져왔습니다."))) {
        setPreview(undefined);
        setJson('');
    } }}>{mode === 'replace' ? t("전체 데이터 교체") : t("데이터 병합")}</ActionButton></div>}</section>;
}
export function SettingsPage(props: SharedProps & {
    nextAlarm: number | null;
}) {
    const { t, locale } = useI18n();
    const { state, run, busy, nextAlarm } = props;
    const [settings, setSettings] = useState<Settings>(state.settings);
    const settingsKey = JSON.stringify(state.settings);
    useEffect(() => { setSettings(JSON.parse(settingsKey) as Settings); }, [settingsKey]);
    const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(old => ({ ...old, [key]: value }));
    return <><div className="page-intro"><span className="eyebrow">{t("편안하게 이어 가는 독서 습관")}</span><h1>{t("설정")}</h1><p>{t("모든 데이터는 현재 Firefox 프로필에 보관됩니다.")}</p></div><form className="card" onSubmit={e => { e.preventDefault(); void run({ type: 'SAVE_SETTINGS', settings }, "설정을 저장했습니다."); }}><h2>{t("매일의 독서 목표")}</h2><label className="check"><input type="checkbox" checked={settings.reminderEnabled} onChange={e => change('reminderEnabled', e.target.checked)}/>{t("매일 독서 알림 받기")}</label><div className="two-columns"><Field label={t("알림 시간 (기기 현지 시간)")}><input type="time" required value={`${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`} onChange={e => { const [hour, minute] = e.target.value.split(':').map(Number); setSettings(old => ({ ...old, hour, minute })); }}/></Field><Field label={t("하루 목표 (분)")}><input type="number" required min={1} max={1440} step={1} value={settings.goalMinutes} onChange={e => change('goalMinutes', Number(e.target.value))}/></Field></div><Field label={t("알림 방식")}><select value={settings.reminderMode} onChange={e => change('reminderMode', e.target.value as Settings['reminderMode'])}><option value="direct">{t("바로 열기 · 책 탭을 열거나 앞으로 가져오기")}</option><option value="gentle">{t("부드러운 알림 · 알림을 누르면 책 열기")}</option></select></Field><div className="two-columns"><Field label={t("다시 알림 간격 (분)")}><input type="number" required min={1} max={120} value={settings.snoozeMinutes} onChange={e => change('snoozeMinutes', Number(e.target.value))}/></Field><Field label={t("놓친 알림의 유예 시간 (분)")}><input type="number" required min={0} max={720} value={settings.graceMinutes} onChange={e => change('graceMinutes', Number(e.target.value))}/></Field></div><p className="help">{t("목표를 달성했거나 이미 독서 시간을 측정 중이면 정기 알림을 생략합니다. 놓친 알림은 유예 시간 안에만 보내고 자정이 지나면 만료됩니다. Firefox가 꺼져 있는 동안에는 동작하지 않습니다.")}</p><h2>{t("독서 시간 측정과 화면")}</h2><label className="check"><input type="checkbox" checked={settings.readerPrompt} onChange={e => change('readerPrompt', e.target.checked)}/>{t("Play Books에서 책을 열면 시작 안내 팝업 표시")}</label><p className="help">{t("URL과 리더 바깥 구조만 확인합니다. 책 본문·Google 계정 정보는 읽지 않습니다. 서재 목록은 대시보드에서 요청할 때만 읽습니다. 주의 집중은 측정할 수 없으며 절전·중단 뒤에는 직접 시작해야 합니다.")}</p><Field label={t('언어 / Language')}><select name="language" value={settings.language} onChange={e => change('language', e.target.value as Settings['language'])}><option value="system">{t('시스템 (Firefox 언어)')}</option><option value="ko">한국어</option><option value="en">English</option></select></Field><p className="help">{t('언어를 선택한 뒤 설정을 저장하세요. 시스템 설정은 Firefox가 한국어이면 한국어, 그 외에는 영어를 사용합니다.')}</p><Field label={t("화면 테마")}><select value={settings.theme} onChange={e => change('theme', e.target.value as Settings['theme'])}><option value="system">{t("시스템 설정")}</option><option value="light">{t("밝은 화면")}</option><option value="dark">{t("어두운 화면")}</option></select></Field><div className="actions"><button className="primary" disabled={busy} aria-busy={busy || undefined}>{t("설정 저장")}</button><ActionButton type="button" onClick={() => run({ type: 'TEST_REMINDER' }, t("저장된 설정으로 알림을 시험했습니다."))}>{t("저장된 설정으로 알림 시험하기")}</ActionButton></div><p className="help">{t("다음 정기 알림: {0} · 시스템 상황에 따라 지연될 수 있습니다.", [nextAlarm ? new Date(nextAlarm).toLocaleString(locale) : t("예약 없음")])}</p></form><Backups {...props}/><section className="card"><h2>{t("이 Firefox에 저장되는 데이터")}</h2><p>{t("태블릿·휴대폰·종이책으로 읽은 시간은 이 PC에서 직접 입력합니다. 다른 기기로 동기화되지 않습니다.")}</p><p className="help">{t("개발용으로 임시 설치한 확장은 Firefox를 재시작하면 해제됩니다. 매일 사용하려면 서명된 확장을 설치해야 합니다. 설치·서명·검증 절차는 프로젝트 README를 확인하세요.")}</p></section></>;
}
