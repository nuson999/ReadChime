import type { Command, Reply } from '../shared/messages';

export function extensionAvailable(): boolean { return typeof browser !== 'undefined' && !!browser.runtime?.id; }
export async function request(command: Command): Promise<Extract<Reply, { ok: true }>> {
  if (!extensionAvailable()) throw new Error('Firefox 확장으로 설치한 뒤 사용하세요. 개발 서버에서는 화면만 미리 볼 수 있습니다.');
  const reply = await browser.runtime.sendMessage(command) as Reply | undefined;
  if (!reply) throw new Error('확장 백그라운드에 연결하지 못했습니다. 확장을 다시 불러오세요.');
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}
