// Hand-drawn 24×24 stroke icons. They inherit currentColor and are always decorative:
// the accessible name comes from the adjacent text or the control's aria-label.
const paths = {
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8M8 11h6',
    home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5',
    chart: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
    library: 'M5 4h3v16H5zM10 4h3v16h-3zM15.5 4.8l2.9-.8 3.4 15.4-2.9.8z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L3.2 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1l.3-2h4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
    check: 'M5 12.5 10 17.5 19 7',
    play: 'M8 5.5v13l10.5-6.5z',
    close: 'M6 6l12 12M18 6 6 18',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18, className = '' }: {
    name: IconName;
    size?: number;
    className?: string;
}) {
    return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'play' ? 1.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>;
}
