import { useI18n } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { State } from '../domain/model';
import type { LibraryCandidate, LibraryFlow } from '../domain/library';
import type { Command } from '../shared/messages';
import { request } from './client';
import { Modal } from './Modal';
const kindNames: Record<LibraryCandidate['kind'], string> = {
    new: '신규 책', existing: '이미 등록됨', enrich: '저자 정보 보완 가능', archived: '제거한 책 · 선택 시 복원', duplicate: '중복 등록 · 확인 필요',
};
const scanMessages = {
    empty: ['현재 서재 목록이 비어 있습니다', '현재 목록에서 책 카드를 찾지 못했습니다. 다른 페이지나 필터를 선택한 상태인지 확인하세요.'],
    'login-required': ['Google 로그인이 필요합니다', 'Play Books 탭에서 로그인하고 내 서재를 여세요. 대시보드로 돌아온 뒤 다시 감지하세요.'],
    loading: ['서재 목록을 불러오는 중입니다', 'Play Books에 책 목록이 나타나면 다시 감지하세요. 자동으로 다시 실행하지는 않습니다.'],
    unsupported: ['내 서재 화면을 확인하지 못했습니다', '공개 추천 화면이나 다른 메뉴를 열었거나 Google 화면 구조가 달라졌을 수 있습니다. 책 목록이 있는 내 서재를 확인하세요. 수동 추가도 계속 사용할 수 있습니다.'],
};
interface Props {
    state: State;
    run: (command: Command, notice?: string) => Promise<boolean>;
    close: () => void;
}
export function LibraryImport({ state, run, close }: Props) {
    const { t, errorText } = useI18n();
    const [flow, setFlow] = useState<LibraryFlow>();
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(true);
    const [applying, setApplying] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [source, setSource] = useState<number>();
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(50);
    const generation = useRef(0);
    const safeClose = useCallback(() => { if (!applying)
        close(); }, [applying, close]);
    const scan = useCallback(async (tabId?: number) => {
        const current = ++generation.current;
        setScanning(true);
        setError('');
        setFlow(undefined);
        setSelected(new Set());
        setSource(tabId);
        setLimit(50);
        try {
            const reply = await request({ type: 'SCAN_LIBRARY', tabId });
            if (generation.current === current)
                setFlow(reply.library);
        }
        catch (err) {
            if (generation.current === current)
                setError(err instanceof Error ? err.message : t("목록을 감지하지 못했습니다."));
        }
        finally {
            if (generation.current === current)
                setScanning(false);
        }
    }, []);
    // Mounting this dialog is itself the user's dashboard button action.
    useEffect(() => { void scan(); return () => { generation.current++; }; }, [scan]);
    const preview = flow?.preview;
    const candidates = preview?.candidates ?? [];
    const selectable = (row: LibraryCandidate) => row.kind !== 'duplicate' && row.kind !== 'existing';
    const visible = candidates.filter(row => (filter === 'all' || row.kind === filter)
        && `${row.title} ${row.author}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    const toggle = (key: string, checked: boolean) => setSelected(old => { const next = new Set(old); if (checked)
        next.add(key);
    else
        next.delete(key); return next; });
    const apply = async () => {
        if (!preview)
            return;
        setApplying(true);
        setError('');
        try {
            const reply = await request({ type: 'APPLY_LIBRARY', scanId: preview.id, keys: [...selected] });
            const result = reply.libraryApplied!;
            await run({ type: 'GET_STATE' }, t("신규 {0}권 · 복원 {1}권 · 저자 보완 {2}권{3}", [result.added, result.restored, result.enriched, result.skipped ? t(" · 이미 반영되어 제외 {0}권", [result.skipped]) : '']));
            close();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("선택한 책을 서재에 반영하지 못했습니다."));
        }
        finally {
            setApplying(false);
        }
    };
    const focus = async (tabId: number) => {
        try {
            await request({ type: 'FOCUS_LIBRARY_TAB', tabId });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("서재 탭을 열지 못했습니다."));
        }
    };
    return <Modal title={t("Play Books에서 가져오기")} close={safeClose} wide>
    <p className="muted">{t("이 화면에서 버튼을 눌렀을 때만 감지합니다. 자동으로 실행하거나 주기적으로 수집하지 않습니다.")}</p>
    {error && <div role="alert" className="error-box">{errorText(error)}</div>}
    {scanning && <div role="status" className="empty"><h3>{t("서재 목록을 확인하는 중…")}</h3><p>{t("책 제목·저자·리더 주소를 읽습니다.")}</p></div>}
    {!scanning && flow?.status === 'opened' && <div className="info-box"><h3>{t("Play Books를 열었습니다")}</h3><p>{t("열린 탭에서 로그인한 뒤 내 서재의 책 목록을 여세요. 이 대시보드로 돌아와 다시 감지해야 합니다.")}</p></div>}
    {!scanning && flow?.status === 'choose-tab' && <div className="library-tab-list"><h3>{t("가져올 책이 있는 서재 탭을 선택하세요")}</h3><p className="help">{t("여러 계정의 목록을 임의로 합치지 않습니다. 필요하면 탭을 열어 먼저 확인하세요.")}</p>{flow.tabs.map(tab => <div className="library-tab" key={tab.id}><div><strong>{tab.title}</strong><small>{t("창 {0} · {1}번째 탭", [tab.windowId, tab.position])}</small></div><div className="actions"><button disabled={applying} onClick={() => void focus(tab.id)}>{t("탭 열어 보기")}</button><button className="primary" onClick={() => void scan(tab.id)}>{t("이 탭에서 감지")}</button></div></div>)}</div>}
    {!scanning && preview && preview.scan.status !== 'ready' && <div className="info-box" role="status"><h3>{t(scanMessages[preview.scan.status][0])}</h3><p>{t(scanMessages[preview.scan.status][1])}</p></div>}
    {!scanning && preview?.scan.status === 'ready' && <>
      <div className="info-box"><strong>{t("현재 불러온 목록에서 {0}권을 찾았습니다.", [candidates.length])}</strong><p>{t("확인한 책 카드 {0}개{1}{2}", [preview.scan.cardsSeen, preview.scan.duplicateCards ? t(" · 반복 카드 {0}개 제외", [preview.scan.duplicateCards]) : '', preview.scan.invalidCards ? t(" · 확인하지 못한 카드 {0}개 제외", [preview.scan.invalidCards]) : ''])}</p><p>{t("전체 서재 수집을 보장하지 않습니다. 필요한 경우 Google에서 ‘모두 표시’를 누르거나 다음 페이지를 연 뒤 다시 감지하세요.")}</p>{(preview.scan.hasNextPage || preview.scan.hasShowAll) && <p><strong>{t("다음 페이지나 ‘모두 표시’ 버튼이 있습니다.")}</strong></p>}{preview.scan.limitReached && <p><strong>{t("한 번에 최대 2,000개 카드까지 확인했습니다. 나머지 카드는 포함되지 않았습니다.")}</strong></p>}</div>
      <div className="library-import-filters"><label className="field"><span>{t("책 검색")}</span><input type="search" placeholder={t("제목 또는 저자")} value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }}/></label><label className="field"><span>{t("등록 상태")}</span><select value={filter} onChange={event => { setFilter(event.target.value); setLimit(50); }}><option value="all">{t("전체 ({0})", [candidates.length])}</option>{Object.entries(kindNames).map(([kind, name]) => <option key={kind} value={kind}>{t(name)} ({candidates.filter(row => row.kind === kind).length})</option>)}</select></label></div>
      <div className="actions library-selection"><button disabled={applying} onClick={() => setSelected(old => new Set([...old, ...candidates.filter(row => row.kind === 'new').map(row => row.key)]))}>{t("신규 책 모두 선택")}</button><button disabled={applying} onClick={() => setSelected(new Set())}>{t("선택 해제")}</button><span className="muted">{t("선택 {0}권 · 검색 결과 {1}권", [selected.size, visible.length])}</span></div>
      <div className="table-scroll library-candidates"><table><thead><tr><th>{t("선택")}</th><th>{t("책 / 저자")}</th><th>{t("처리")}</th></tr></thead><tbody>{visible.slice(0, limit).map(row => {
                const existing = state.books.find(book => book.id === row.existingIds[0]);
                return <tr key={row.key}><td><input type="checkbox" aria-label={`${row.title} ${row.kind === 'archived' ? t("복원") : t("선택")}`} checked={selected.has(row.key)} disabled={applying || !selectable(row)} onChange={event => toggle(row.key, event.target.checked)}/></td><td><strong className="table-book">{row.title}</strong><small>{row.author || t("저자 정보 없음")} · <a href={row.url} target="_blank" rel="noopener noreferrer">{t("책 주소 열어 보기")}</a></small>{existing && row.title !== existing.title && <small>{t("현재 서재의 제목: {0}", [existing.title])}</small>}</td><td><span className={`pill${row.kind === 'new' ? ' live' : ''}`}>{t(kindNames[row.kind])}</span>{row.kind === 'duplicate' && <small>{t("같은 책 ID로 {0}권이 등록되어 있습니다. 자동으로 병합하지 않습니다.", [row.existingIds.length])}</small>}{row.kind === 'archived' && <small>{t("선택하면 기존 기록을 유지한 채 복원합니다.")}</small>}{row.kind === 'enrich' && <small>{t("선택하면 비어 있는 저자 정보만 보완합니다.")}</small>}</td></tr>;
            })}</tbody></table>{!visible.length && <p className="empty">{t("조건에 맞는 책이 없습니다.")}</p>}{visible.length > limit && <button onClick={() => setLimit(old => old + 50)}>{t("50권 더 보기")}</button>}</div>
      <p className="help">{t("신규 책은 ‘읽을 책’으로 등록합니다. 기존 제목·메모·상태·현재 책·독서 기록은 그대로 유지합니다. 이번 목록에서 찾지 못한 책도 제거하지 않습니다. 감지 결과는 10분 동안 사용할 수 있습니다.")}</p>
    </>}
    {!scanning && <div className="actions end"><button disabled={applying} onClick={safeClose}>{t("닫기")}</button>{flow?.status !== 'choose-tab' && <button disabled={applying} onClick={() => void scan(source)}>{t("목록 다시 감지")}</button>}{flow?.status === 'scanned' && <button disabled={applying} onClick={() => void scan()}>{t("서재 탭 다시 고르기")}</button>}{preview?.scan.status === 'ready' && <button className="primary" disabled={applying || selected.size === 0} onClick={() => void apply()}>{applying ? t("서재에 반영하는 중…") : t("선택한 {0}권 반영하기", [selected.size])}</button>}</div>}
  </Modal>;
}
