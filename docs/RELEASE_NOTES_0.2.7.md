# ReadChime 0.2.7

## English

- Fixed the reading timer ending a session on its own while the Play Books tab stayed visible, for example on a second display while another app had focus.
- A late or missing heartbeat now only skips the unconfirmed seconds; counting continues automatically on the next visible observation instead of ending the session.
- The reader page now timestamps each observation itself, so a busy background queue can no longer look like a clock jump.
- Sessions still end only when you stop them, close the reader tab, switch to another book, or restart the browser.
- Permissions and data handling are unchanged from 0.2.6.

## 한국어

- Play Books 탭이 계속 보이는데도(예: 다른 앱을 쓰는 동안 보조 모니터에 띄워 둔 경우) 독서 타이머가 저절로 끝나던 문제를 고쳤습니다.
- 확인 신호가 늦거나 빠지면 확인되지 않은 시간만 빼고, 다음에 화면이 확인되면 세션을 끝내지 않고 자동으로 이어서 셉니다.
- 책 화면이 확인 시각을 직접 기록해, 확장 내부 처리가 밀려도 시계가 어긋난 것으로 판단하지 않습니다.
- 세션은 직접 종료하거나, 책 탭을 닫거나, 다른 책으로 바꾸거나, 브라우저를 다시 시작할 때만 끝납니다.
- 권한과 데이터 처리 방식은 0.2.6과 같습니다.
