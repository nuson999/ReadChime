import { readerKey } from './books';

export interface Detection { key: string | null; supported: boolean; reason: string }
export interface ReaderDetector { detect(url: string, root: Pick<Document, 'querySelector'>): Detection }
export const playBooksDetector: ReaderDetector = {
  detect(url, root) {
    const key = readerKey(url);
    const supported = !!key && !!root.querySelector('reader-control') && !!root.querySelector('iframe.-gb-display');
    return { key, supported, reason: supported ? '저장본에서 확인한 리더 구조와 일치합니다. 실제로 주의를 집중하는지는 측정하지 않습니다.'
      : key ? '지원되는 리더 구조를 확인하지 못했습니다. 이 탭에서 책을 읽고 있는지 직접 확인하세요.' : 'Play Books 독서 페이지가 아닙니다.' };
  },
};
