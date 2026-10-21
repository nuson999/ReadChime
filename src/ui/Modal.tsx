import { useI18n } from './i18n';
import { useEffect, useId, type ReactNode } from 'react';
export function Modal({ title, children, close, wide = false }: {
    title: string;
    children: ReactNode;
    close: () => void;
    wide?: boolean;
}) {
    const { t } = useI18n();
    const titleId = useId();
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        const focusables = () => [...dialog!.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex="0"]')].filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
        (focusables()[1] ?? focusables()[0])?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                close();
            if (event.key === 'Tab') {
                const elements = focusables();
                const first = elements[0], last = elements.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };
        document.addEventListener('keydown', keydown);
        return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
    }, [close]);
    return <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget)
        close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal${wide ? ' modal-wide' : ''}`}>
      <div className="section-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t("닫기")} onClick={close}>×</button></div>
      {children}
    </section>
  </div>;
}
