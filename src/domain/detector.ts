import { readerKey } from './books';

export interface Detection { key: string | null; supported: boolean; reason: string; title?: string; author?: string }
export interface ReaderDetector { detect(url: string, root: Pick<Document, 'querySelector'>): Detection }
export const playBooksDetector: ReaderDetector = {
  detect(url, root) {
    const key = readerKey(url);
    const supported = !!key && !!root.querySelector('reader-control') && !!root.querySelector('iframe.-gb-display');
    const clean = (value: string | null | undefined, limit: number) => value?.replace(/\s+/g, ' ').trim().slice(0, limit) || undefined;
    const pageTitle = clean(root.querySelector('title')?.textContent, 350);
    const title = supported ? clean(root.querySelector('meta[property="og:title"]')?.getAttribute('content')
      ?? (/\s[-–—]\sGoogle Play (?:Books|북|도서)$/i.test(pageTitle ?? '') ? pageTitle?.replace(/\s[-–—]\sGoogle Play (?:Books|북|도서)$/i, '') : undefined), 300) : undefined;
    const author = supported ? clean(root.querySelector('meta[name="author"]')?.getAttribute('content'), 200) : undefined;
    return { key, supported, ...(title ? { title } : {}), ...(author ? { author } : {}), reason: supported ? '저장본에서 확인한 리더 구조와 일치합니다. 실제로 주의를 집중하는지는 측정하지 않습니다.'
      : key ? '지원되는 리더 구조를 확인하지 못했습니다. 이 탭에서 책을 읽고 있는지 직접 확인하세요.' : 'Play Books 독서 페이지가 아닙니다.' };
  },
};
