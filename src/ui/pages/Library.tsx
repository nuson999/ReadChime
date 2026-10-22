import { useI18n } from '../i18n';
import { useCallback, useState, type FormEvent } from 'react';
import { type Book } from '../../domain/model';
import { Modal } from '../Modal';
import { LibraryImport } from '../LibraryImport';
import { ActionButton, statusNames, Field, Empty, type Run, type SharedProps } from '../components/common';
export function BookForm({ initial, run, close, busy }: {
    initial?: Book;
    run: Run;
    close: () => void;
    busy: boolean;
}) {
    const { t } = useI18n();
    const now = new Date().toISOString();
    const [book, setBook] = useState<Book>(initial ?? { id: crypto.randomUUID(), title: '', author: '', url: '', status: 'planned', notes: '', createdAt: now, updatedAt: now });
    const change = <K extends keyof Book>(key: K, value: Book[K]) => setBook(old => ({ ...old, [key]: value }));
    const submit = async (e: FormEvent) => { e.preventDefault(); if (await run({ type: 'SAVE_BOOK', book }, t("책을 저장했습니다.")))
        close(); };
    return <Modal title={initial ? t("책 수정") : t("서재에 책 추가하기")} close={close}><form onSubmit={e => void submit(e)}><Field label={t("책 제목")}><input autoComplete="off" required maxLength={300} value={book.title} onChange={e => change('title', e.target.value)}/></Field><Field label={t("저자 (선택)")}><input maxLength={200} value={book.author} onChange={e => change('author', e.target.value)}/></Field><Field label={t("Play Books 리더 주소 (선택)")} hint={t("Play Books에서 책을 열고 주소창의 /books/reader?id=… 주소를 복사하세요. 종이책을 등록할 때는 비워 둬도 됩니다.")}><input type="url" placeholder="https://play.google.com/books/reader?id=…" maxLength={2048} value={book.url} onChange={e => change('url', e.target.value)}/></Field><Field label={t("독서 상태")}><select value={book.status} onChange={e => change('status', e.target.value as Book['status'])}>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></Field><Field label={t("메모 (선택)")}><textarea maxLength={4000} rows={3} value={book.notes} onChange={e => change('notes', e.target.value)}/></Field><div className="actions end"><button type="button" onClick={close}>{t("취소")}</button><button className="primary" disabled={busy} aria-busy={busy || undefined}>{t("저장")}</button></div></form></Modal>;
}
export function Library(props: SharedProps & {
    edit: (book?: Book) => void;
    history: (bookId: string) => void;
}) {
    const { t } = useI18n();
    const [importing, setImporting] = useState(false);
    const closeImport = useCallback(() => setImporting(false), []);
    const { state, edit, history, run, busy } = props;
    const [filter, setFilter] = useState('all');
    const books = state.books.filter(b => !b.archivedAt && (filter === 'all' || b.status === filter));
    return <><div className="page-intro row"><div><span className="eyebrow">{t("다시 펼치고 싶은 책들")}</span><h1>{t("내 서재")}</h1><p>{t("계정에 연결하지 않고 내가 고른 책만 담습니다.")}</p></div><div className="actions"><button disabled={busy} onClick={() => setImporting(true)}>{t("Play Books에서 가져오기")}</button><button className="primary" onClick={() => edit()}>{t("＋ 책 추가")}</button></div></div>{importing && <LibraryImport state={state} run={run} close={closeImport}/>}<div className="filter-row"><label>{t("독서 상태 ")}<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("전체")}</option>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></label><span className="muted">{t("{0}권", [books.length])}</span></div>{books.length ? <div className="book-grid">{books.map((book, index) => <article key={book.id} className="card book-card"><div className={`book-spine tone-${index % 3}`} aria-hidden="true"><span>READ<br />CHIME</span><span>▤</span></div><div className="book-body"><div className="book-badges"><span className="pill">{t(statusNames[book.status])}</span>{state.settings.currentBookId === book.id && <span className="pill live">{t("현재 책")}</span>}</div><h2>{book.title}</h2><p className="muted">{book.author || t("저자 정보 없음")}</p><p className="book-note">{book.notes}</p><div className="actions"><ActionButton onClick={() => run({ type: 'SELECT_BOOK', id: book.id }, t("현재 책으로 선택했습니다."))}>{t("현재 책으로 선택")}</ActionButton><ActionButton disabled={!book.url} onClick={() => run({ type: 'OPEN_BOOK', id: book.id })}>{t("책 열기 ↗")}</ActionButton></div><div className="actions book-links"><button className="text-button" onClick={() => history(book.id)}>{t("기록 보기")}</button><button className="text-button" onClick={() => edit(book)}>{t("수정")}</button><ActionButton className="text-button danger" onClick={() => { if (confirm(t("‘{0}’ 책을 서재에서 제거할까요? 독서 기록은 보존합니다.", [book.title])))
        return run({ type: 'DELETE_BOOK', id: book.id }, t("서재에서 책을 제거했습니다. 독서 기록은 그대로 보존했습니다.")); }}>{t("서재에서 제거")}</ActionButton></div></div></article>)}</div> : <section className="card"><Empty title={t("서재에 첫 책을 담아 보세요")}>{t("책을 추가하세요. Play Books 주소가 없어도 종이책이나 태블릿에서 읽은 책을 기록할 수 있습니다.")}</Empty><div className="actions center"><button onClick={() => edit()}>{t("첫 책 추가하기")}</button></div></section>}</>;
}
