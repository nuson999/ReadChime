# ReadChime

[한국어](#korean) · [English](#english)

<a id="korean"></a>

## 한국어 · 하루 한 페이지

Firefox 데스크톱용 로컬 독서 습관 확장 프로그램입니다. 기본 알림은 **현지 시각 22:00**, 하루 목표는 **5분**, 알림 방식은 **책 바로 열기**, 책을 열면 **시작 안내 팝업**이 표시되며, **독서 시작 버튼을 누른 뒤에만** 시간을 기록합니다. 한국어와 영어를 지원합니다.

서재, 완료된 독서 기록, 설정은 `browser.storage.local`에 저장됩니다. 서버·계정·텔레메트리·동기화가 없으며 대시보드와 백업은 네트워크 없이 동작합니다. Play Books 책을 여는 기능 자체에는 인터넷과 해당 책에 대한 Google 접근 권한이 필요합니다.

### 언어 설정

**대시보드 → 설정 → 언어 / Language**에서 **시스템 (Firefox 언어)**, **한국어**, **English** 중 하나를 고른 뒤 **설정 저장**을 누르세요. 기본값인 시스템 설정은 Firefox의 표시 언어가 한국어이면 한국어, 그 외에는 영어를 사용합니다. 선택한 언어는 팝업·대시보드·알림·오류 안내·접근성 이름과 날짜·숫자 표시에 적용되며 재시작 후에도 유지됩니다. 알림의 예약 시각과 기존 독서 날짜는 바뀌지 않습니다.

언어 선택은 JSON 백업의 설정에 포함됩니다. 이전 백업에 언어 항목이 없으면 시스템 설정을 사용합니다. 병합 시에는 현재 설정을 유지하며 가져온 설정 적용을 선택하거나 전체 교체를 할 때만 백업의 언어를 적용합니다. 책 제목·저자·메모·기록에 저장된 제목은 번역하지 않습니다. Firefox 부가 기능 목록의 이름·설명·도구 모음 기본 제목은 Firefox 표시 언어를 따르므로 앱의 수동 언어 선택과 다를 수 있습니다. 로그인·권한·파일 선택 등 Firefox나 운영체제가 띄우는 창도 해당 시스템의 언어를 따릅니다.

### 빠른 시작

Node.js 22.19 이상과 Firefox 140 이상을 사용하세요. 이 프로젝트에서 실제 검증한 환경은 Windows, Node.js 24.20.0, Firefox 158.0.1입니다.

```powershell
npm ci
npm run check
```

`npm run check`는 타입 검사 → ESLint → Vitest → 배포 빌드 및 파일 경로 확인 → Firefox 확장 검사 순서로 실행합니다.

Firefox에서 다음과 같이 설치합니다.

1. `about:debugging#/runtime/this-firefox`를 엽니다.
2. **임시 부가 기능 로드**를 누릅니다.
3. 이 폴더의 **`dist/manifest.json`**을 선택합니다.
4. 확장 메뉴에서 ReadChime을 열고 대시보드의 **내 서재 → 책 추가**로 시작합니다.
5. Play Books 접근 권한을 허용합니다. 설치 전에 열려 있던 책 탭은 새로고침해야 할 수 있습니다.

대시보드는 확장 내부 `dashboard.html`입니다. 확장 팝업의 **대시보드 ↗**를 사용하세요. 소스의 HTML을 직접 열거나 개발 서버를 켜 둘 필요가 없습니다.

**중요:** 임시 설치는 Firefox를 재시작하면 해제됩니다. 일상적으로 사용하려면 Mozilla 서명된 XPI를 설치해야 합니다. 안정된 확장 ID `readchime@local.invalid`를 사용하지만 임시 설치의 데이터 보존 결과를 일반 설치·제거의 보장으로 해석하면 안 됩니다. [Mozilla 임시 설치 설명](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

### 개발 명령

| 명령                           | 동작                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `npm run dev`                  | Vite 화면 미리보기. 확장 API·저장은 사용할 수 없고 빈 화면 상태를 보여 줍니다 |
| `npm run dev:extension`        | 확장 배포 파일을 감시하며 다시 빌드                                           |
| `npm run firefox`              | `dist/`를 별도 개발 Firefox 프로필에 임시 설치. 먼저 빌드 완료를 기다리세요   |
| `npm run build`                | 팝업·대시보드·백그라운드·콘텐츠 스크립트와 로컬 자산 빌드                     |
| `npm run typecheck`            | TypeScript strict 검사                                                        |
| `npm run lint`                 | ESLint 검사                                                                   |
| `npm test`                     | 도메인과 백그라운드 통합 테스트                                               |
| `npm run test:watch`           | 파일 변경을 감시하며 Vitest 재실행                                            |
| `npm run validate:firefox`     | `web-ext lint`로 `dist/` 검사                                                 |
| `npm run test:firefox`         | 별도 임시 프로필의 헤드리스 Firefox에서 설치·UI·저장·백업·재시작 검증         |
| `npm run test:firefox:library` | 별도 Firefox와 합성 서재 DOM으로 수동 감지·탭 선택·선택 반영 검증             |
| `npm run test:firefox:reader`  | 합성 읽기 화면의 URL 대조·시작 안내·버튼·기록 전환 검증                     |
| `npm run test:firefox:i18n`    | 한국어·영어 화면, 팝업, 오류 안내, 설정·백업·재시작 유지 검증                 |
| `npm run package`              | 다시 빌드한 뒤 `artifacts/`에 서명 전 ZIP 생성                                |

`test:firefox`는 GeckoDriver를 최초 다운로드하므로 첫 실행에는 네트워크가 필요합니다. Firefox가 기본 설치 경로에 없다면 `$env:FIREFOX_BINARY = '설치 경로\firefox.exe'`로 지정하세요. 로그·스크린샷·테스트 프로필은 `.tmp/`에 생성됩니다. 실제 프로필의 기록이나 Google 계정을 사용하지 않습니다. Firefox 158 이후의 확장 페이지 자동화에 필요한 시스템 접근 설정은 이 테스트 프로세스와 자식 프로세스에만 적용됩니다.

### 책과 독서 시작

Play Books에서 실제 책을 연 다음 주소창의 다음 형태를 복사합니다.

```text
https://play.google.com/books/reader?id=책_ID
```

책 제목은 직접 입력합니다. 저자·주소·메모는 선택입니다. 홈페이지, 서점 상세 페이지, `http:`, 다른 호스트, 사용자 정보가 포함된 URL은 책 주소로 저장하지 않습니다. 저장 시 책 ID만 유지한 정규 주소를 사용해 같은 책의 페이지별 URL이 중복 탭을 만들지 않게 합니다.

**현재 책으로 선택**을 누르면 미완독 책 중 최우선으로 이어 읽습니다. 이후에는 최근 읽은 미완독 책, 읽는 중인 책, 읽을 책 순서입니다. 완독·잠시 멈춤·서재에서 제거한 책은 추천에서 제외합니다. 책 주소가 없으면 내 서재 화면을 엽니다. 계정 API를 조회하거나 책 접근 가능 여부를 추측하지 않습니다. 사용자가 열어 둔 서재의 화면 목록은 아래 기능으로 선택해서 가져올 수 있습니다.

**독서 시작**은 해당 책 탭을 열거나 전면으로 가져온 뒤 타이머를 연결합니다. 지원 구조를 확인하지 못하면 **이 탭에서 실제로 읽고 있습니다**를 체크해 명시적으로 시작할 수 있습니다. 이 경우에도 책 ID가 일치하는 리더 URL이어야 합니다. 홈페이지에서는 타이머를 시작하지 않습니다.

Play Books 읽기 화면을 열면 URL의 책 ID를 등록된 리더 주소와 먼저 대조해 팝업의 책을 자동 선택합니다. 페이지 위치·추적 옵션은 무시하고, 기존 제목·저자·메모는 유지합니다. 등록되지 않은 책은 지원되는 리더 바깥 구조가 확인될 때만 자동 추가합니다. 제목을 아직 확인하지 못하면 임시 ID로 유지하고 나중에 같은 책 정보를 보완하며, 직접 수정한 제목은 덮어쓰지 않습니다.

새 읽기 화면에서는 ReadChime 시작 팝업을 한 번 엽니다. 도구 모음 팝업을 자동으로 열 수 없는 Firefox 환경에서는 책 화면 우측 상단에 같은 시작 안내를 표시합니다. **버튼을 누르기 전에는 기록하지 않습니다.** 완독·잠시 멈춤·제거 상태는 유지하며 **읽기 재개**를 눌렀을 때만 복원합니다. 설정에서 시작 안내를 꺼도 열린 책의 자동 선택과 수동 시작은 계속 사용할 수 있습니다. 기존 백업의 자동 시작 값이 켜져 있어도 즉시 기록하지 않습니다.

### Play Books 서재에서 선택 가져오기

대시보드의 **내 서재 → Play Books에서 가져오기**를 누릅니다. 기존 **책 추가**와 수동 수정 기능도 그대로 사용할 수 있습니다.

1. 같은 Firefox에 열린 `https://play.google.com/books` 서재 탭이 하나라면 그 탭을 감지합니다. 여러 개라면 대상 탭을 선택합니다. **탭 열어 보기**로 먼저 내용을 볼 수 있습니다.
2. 대상 탭이 없으면 Play Books를 열고 안내합니다. 로그인과 서재 준비를 마친 다음 대시보드로 돌아와 다시 감지하세요. 로그인 완료를 기다렸다가 자동 실행하지 않습니다.
3. 현재 로드된 서재 그리드에서 **제목·저자·리더 주소**를 읽어 선택 미리보기를 표시합니다. 이 단계에서는 영구 서재에 책을 추가하지 않습니다.
4. **신규 책 모두 선택** 또는 개별 체크박스로 고르고 **선택한 책 반영하기**를 누릅니다. 제거된 책 복원과 빈 저자 보완은 개별 선택합니다.

**이 기능은 대시보드 버튼을 누를 때만 실행합니다.** 페이지 방문·DOM 변경·브라우저 시작·예약 알람으로 실행하거나 주기적으로 목록을 수집하지 않습니다. 현재 읽기 탭의 책 한 권을 자동 인식하는 기능과는 별개입니다.

범위는 **현재 로드된 목록**입니다. 화면 아래의 책도 DOM에 로드되어 있으면 포함하지만 Google의 다음 페이지나 ‘모두 표시’ 버튼을 자동으로 누르지 않습니다. 전체가 필요하면 Google에서 직접 해당 표시를 준비한 뒤 다시 감지하세요. 페이지·모두 표시 컨트롤, 잘못된 카드, 중복 카드와 최대 2,000개 카드 제한 여부를 안내하며 전체 서재 수집을 보장하지 않습니다. 로그인 필요·로딩 중·지원하지 않는 화면·현재 목록 0권을 구분합니다. 공개 추천이나 서점 목록은 내 서재로 취급하지 않습니다.

책의 중복은 **Play Books 책 ID**로 판단합니다. 제목만 같은 주소 없는 수동 책은 합치지 않습니다.

| 미리보기 상태  | 선택 반영 동작                                                        |
| -------------- | --------------------------------------------------------------------- |
| 신규           | 새 UUID로 ‘읽을 책’ 등록                                              |
| 이미 등록됨    | 추가하지 않고 현재 정보 유지                                          |
| 저자 보완 가능 | 선택한 경우에만 비어 있는 저자 보완                                   |
| 제거한 책      | 선택한 경우에만 기존 UUID와 이력을 유지해 복원. 원래 독서 상태도 보존 |
| 기존 중복      | 같은 Play Books ID의 기존 UUID가 여러 개면 자동 추가·병합 없이 안내   |

기존 제목·메모·상태·현재 책 선택·독서 기록은 보존하며 감지하지 못한 책을 삭제하거나 숨기지 않습니다. 반영 직전 해당 책들의 상태를 다시 검사해 그동안 수동 추가·수정한 정보가 덮어써지지 않게 합니다.

미리보기의 선택 가능 시간은 10분입니다. 최근 결과는 디스크의 영구 서재와 분리된 확장 세션 메모리에 보관하므로 백그라운드 이벤트 페이지가 잠시 중단되어도 사용할 수 있습니다. 다른 감지로 교체되거나 브라우저를 닫으면 다시 감지해야 합니다. 백업에는 포함하지 않습니다. [Mozilla 세션 저장소 설명](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session)

감지 규칙은 제공된 서재 HTML에서 검증했습니다. 실제 로그인한 Google 계정의 현행 화면은 아직 검증하지 않았으므로 구조 변경 시 감지 실패 안내가 나올 수 있습니다. 책 본문·쿠키·로그인 토큰·계정 정보를 읽거나 비공개 계정 API를 호출하지 않습니다.

### 타이머의 의미와 한계

- 연결된 책 탭이 선택되어 있고 창이 최소화되지 않았으며 페이지가 표시 상태이면 계산합니다. 다른 앱에서 메모하느라 Firefox 포커스가 없어도 계속 측정합니다. 다른 앱이 창을 완전히 덮었는지까지는 정확히 감지하지 못할 수 있습니다.
- 탭 전환·최소화·페이지 숨김 후 5초 안에 돌아오면 버튼 없이 이어 갑니다. 숨겨진 시간은 합산하지 않습니다. 5초를 넘기거나 직접 일시정지하면 책 페이지 오른쪽 위의 **읽기 재개** 버튼을 눌러야 합니다. 안내는 작은 버튼으로 접을 수 있고 시작 안내 설정과 별개로 표시됩니다.
- 같은 책 새로고침·서재 왕복·같은 책의 다른 탭으로 직접 이동할 때도 기록과 5초 규칙을 유지합니다. 다른 창에 보이는 책만으로 측정 탭을 바꾸지 않습니다.
- 마우스나 키보드를 움직이지 않아도 읽을 수 있으므로 입력 활동을 독서 판단에 사용하지 않습니다.
- 콘텐츠 스크립트가 약 5초마다 보내는 관측과 시각·단조 시계·문서 토큰을 비교하고 확인된 구간을 저장합니다. 백그라운드 `setInterval`에 시간을 맡기지 않습니다.
- 12초를 넘는 전면 관측 공백, 시계 역행, 시계 간 불일치, 시간대 변경은 불확실한 구간으로 처리합니다. 확인되지 않은 구간은 더하지 않습니다. 브라우저 시작·탭 닫힘·확장 재설치 등 중단 복구에서는 확인된 기록만 남깁니다.
- 마지막 관측 이후의 몇 초, 포커스 전환 직전 구간 등이 누락될 수 있습니다. 절전 여부를 완벽하게 식별하거나 실제 주의 집중을 측정하지 못합니다. 기록은 **추정 타이머**로 표시하며 수정할 수 있습니다.
- 동시에 타이머는 하나만 실행됩니다. 5분 미만도 저장하고 목표를 달성해도 자동 종료하지 않습니다. 1초 미만의 세션은 기록하지 않습니다.
- 기록은 언제나 시작 버튼을 눌러 시작합니다. 종료 후 같은 읽기 화면에서는 시작 안내를 반복하지 않습니다. 새로고침과 일반 탭 전환으로 일시정지가 풀리지 않으며, 다른 책으로 이동하면 이전 확인 시간을 저장하고 새 책의 시작 입력을 기다립니다.

감지 근거와 미검증 범위는 [docs/DETECTION.md](docs/DETECTION.md)를 참고하세요.

### 알림

일일 알림은 다음 **현지 시각**의 이름 있는 일회성 `browser.alarms` 예약입니다. 설치·시작·설정 변경·알림 실행·확장 UI 사용 시 확인하며 1분 간격의 보정 알람으로 누락된 예약과 시간대·시계 변경을 다시 확인합니다. 정확히 그 초에 실행된다고 보장하지 않습니다. [Mozilla 알람 수명 설명](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms)

- **바로 열기:** 현재 추천 책을 열거나 일치하는 기존 탭을 전면으로 가져옵니다. 타이머를 시작하는 동작과는 별개입니다.
- **부드러운 알림:** 기본 알림을 표시하고 본문 클릭 시 책을 엽니다. Firefox 알림에는 지원하지 않는 동작 버튼을 만들지 않습니다. **책 열기**·**다시 알림**·**오늘 알림 건너뛰기**는 팝업과 대시보드에서 사용합니다.
- 목표를 이미 채웠거나 측정 중이면 당일 정기 알림을 생략합니다. 수동 기록도 목표에 포함됩니다.
- Firefox가 예정 시각에 꺼져 있었다면 다음 시작 시 기본 120분의 유예 안에서만 보냅니다. 자정이 되면 전날 알림은 만료합니다. Firefox를 외부에서 실행시키는 기능은 없습니다.
- 정기 알림은 당일 한 번만 처리합니다. 사용자가 요청한 다시 알림은 예외이며 자정을 넘기는 다시 알림은 예약하지 않습니다. 오늘 건너뛰기는 당일 다시 알림도 취소합니다.
- 중복 방지를 위해 전달 상태를 먼저 저장합니다. 저장 직후 강제 종료되거나 OS가 알림을 차단하면 알림이 누락될 수 있습니다. 자동 재시도로 탭을 반복해서 열지는 않습니다. 설정의 **저장된 설정으로 알림 시험하기**로 동작을 확인할 수 있습니다.

### 태블릿·스마트폰·종이책 수동 기록

**독서 기록 → 독서 시간 직접 기록**에서 책, 날짜, 분량, 기기, 메모를 입력합니다. 5분 미만도 입력할 수 있고 미래 날짜는 허용하지 않습니다. 날짜의 기존 합계를 확인하고 **이미 기록된 시간과 겹치지 않는 추가 독서**임을 체크합니다.

날짜와 분량만으로 실제 겹침을 자동 판별하지 않습니다. 예를 들어 타이머의 8분을 포함한 총 20분을 읽었다면 추가 입력은 12분입니다. 백업의 같은 ID는 중복 제거하지만 서로 다른 ID의 기록이 실제 같은 독서였는지는 사용자가 확인해야 합니다.

직접 입력은 실제 시작·종료 시각을 알 수 없는 **날짜 정밀도**의 기록입니다. ISO 시작·종료 필드는 선택 날짜의 자정을 가리키는 동일한 기준점이며 실제 독서 시각을 뜻하지 않습니다. 통계는 명시적인 `localDate`와 `durationSeconds`를 사용합니다. 타이머 기록은 실제 관측 구간에서 날짜를 나누고 당시 시간대를 보존합니다. 이후 시간대가 바뀌어도 과거 달력은 이동하지 않습니다.

책 삭제는 기본적으로 서재에서만 제거합니다. 기록과 당시 책 제목은 보존됩니다. **독서 기록**에서 제거된 책을 필터로 고르면 연결된 기록 수를 확인한 후 책과 기록을 영구 삭제할 수 있습니다.

### 통계와 목표

오늘, 월요일부터 시작하는 이번 주, 이번 달의 합계와 7일·30일 차트, 13주 달력, 책·기기별 전체 누적 시간을 제공합니다. 기간 달성률과 평균은 기록 없는 날도 포함합니다. 차트에는 날짜별 숫자 표도 있습니다.

목표 변경은 오늘과 이후에 적용하고 과거 목표는 보존합니다. 과거 기록을 수정하면 당시 목표로 달성 여부를 다시 계산합니다. 자정을 넘긴 타이머는 현지 날짜별 기록으로 나눕니다. 실제 데이터가 없는 화면은 0과 빈 상태를 표시하며 예시 독서 데이터를 자동 삽입하지 않습니다.

### 백업·복원과 데이터 안전

설정에서 **JSON 백업 내려받기**를 사용하세요. 책·설정·날짜별 목표·완료된 기록을 포함하며 진행 중인 타이머와 당일 알림 처리 상태는 제외합니다. 파일은 암호화되지 않으므로 제목과 메모도 포함됨을 유의하세요. **확장 제거·프로필 삭제 전에 백업하세요.**

파일을 선택하면 형식·버전·날짜·시간·ID·책 참조·리더 주소를 검증하고 미리보기를 표시합니다. 최대 25MB입니다.

- **병합:** 새 ID 추가, 같은 내용은 건너뛰기, 같은 ID의 다른 내용은 현재 값 보존이 기본입니다. 충돌별로 가져온 값을 선택할 수 있습니다. 현재 설정과 과거 목표가 기본적으로 유지됩니다.
- **전체 교체:** 현재 책과 기록 수를 표시하고 별도 확인을 받아 교체합니다. 가져온 설정·목표도 적용합니다.
- 진행 중인 타이머가 있거나 미리보기 이후 데이터가 바뀌면 가져오기를 중단합니다. 파일을 다시 선택해 확인하세요.
- 모든 쓰기는 백그라운드 한 곳에서 직렬화하고 단일 루트 키를 검증한 다음 저장합니다. 쓰기 실패 시 메모리의 기존 상태도 유지합니다.
- 스키마는 버전 2입니다. 버전 1에서 날짜·측정 종류·목표 이력을 보완하는 이전 경로를 제공합니다. 이전 형식에는 당시 시간대 정보가 없으므로 UTC 기준 날짜로 명시적으로 이전합니다. 알 수 없는 미래 버전이나 손상된 데이터는 덮어쓰지 않습니다.

### 권한

| 권한                             | 용도                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `storage`                        | 서재·설정·기록·복구 지점 저장                                                 |
| `alarms`                         | 일일 알림·다시 알림·예약 보정                                                 |
| `notifications`                  | 부드러운 알림                                                                 |
| `https://play.google.com/books*` | 책 탭 URL·리더 바깥 구조 확인, 사용자가 요청한 서재 화면의 책 메타데이터 감지 |

전체 사이트의 탭 URL을 읽는 `tabs` 권한, 쿠키·다운로드·웹 요청 가로채기 권한은 요청하지 않습니다. Firefox 권한 안내는 호스트 접근을 도메인 단위로 설명할 수 있지만 콘텐츠 스크립트는 지정 경로에만 연결됩니다. 모든 실행 JS/CSS는 패키지에 포함하고 확장 페이지의 네트워크 연결도 CSP로 차단합니다. 책 본문 iframe 내부를 탐색하거나 DRM을 우회하지 않습니다.

### 패키지와 일상용 서명

```powershell
npm run package
```

생성된 ZIP은 **서명 전 개발 패키지**입니다. 일반 Firefox에 상시 설치 가능한 서명본이 아닙니다. Mozilla 개발자 허브에서 자체 배포용 비공개(unlisted) 서명을 받아야 합니다. 공개 검색 목록에 올릴 필요는 없습니다. [Mozilla 서명·배포 안내](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

**0.2.1 서명본 준비 완료:** `artifacts/readchime-0.2.1-signed.xpi`는 Mozilla가 비공개 서명한 일반 설치용 파일입니다. Firefox에서 `about:addons` → 톱니 메뉴 → **파일에서 부가 기능 설치**로 이 파일을 한 번 설치하세요. 기존 임시 확장은 먼저 삭제하지 않습니다. 별도 Firefox 프로필에서 임시 확장의 데이터를 보존한 채 서명본을 설치하고, 완전 종료·재실행 뒤 재등록 없이 유지되는 것을 확인했습니다. 사용자 기본 프로필의 설치는 직접 진행해야 합니다. [서명 상태와 검증 기록](docs/MOZILLA_SIGNING.md)

검토할 파일은 `artifacts/`의 ZIP이며 실제 제출에는 패키지와 필요 시 재현 가능한 빌드 소스가 필요합니다. 빌드는 `npm ci` 후 `npm run build`입니다. 사용자 제공 원본 HTML·자산, `.tmp/` 테스트 프로필, 개인 백업, 비밀 값은 제출 소스에 포함하지 마세요. 0.2.1은 사용자가 Mozilla 인증·약관 동의·파일 선택을 직접 진행한 뒤 비공개 제출 및 서명이 완료됐습니다.

### 구조

```text
ReadChime/
  src/
    domain/       모델·날짜·통계·추천·URL·예약·타이머·감지
    data/         저장소 인터페이스·직렬화·이전·백업 병합
    background/   단일 쓰기 소유자, 브라우저 이벤트와 명령
    content/      리더 바깥 구조 감지와 관측 신호
    shared/       검증된 런타임 메시지 계약
    i18n/         언어 선택·영어 번역·오류 표시
    ui/           React 대시보드·팝업·가져오기 미리보기·스타일
  public/         Firefox MV3 manifest·한국어/영어 메타데이터·SVG 아이콘
  tests/          Vitest 도메인·백그라운드 통합 테스트
  scripts/        확장 빌드·파일 확인·실제 Firefox QA
  docs/           감지 근거와 검증 기록
  dashboard.html / popup.html
  dist/           생성된 확장 (이 폴더의 manifest를 로드)
  artifacts/      생성된 서명 전 배포 ZIP
```

현재 체크아웃에는 처음 제공된 Play Books 원본 HTML 두 개가 없습니다. 자동 테스트는 `tests/fixtures.ts`의 합성 DOM을 사용하며 원본 저장본이나 실제 계정 검증을 대신하지 않습니다. 미래 저장 어댑터는 `StorageAdapter` 경계에 추가할 수 있습니다. 현재 코드에는 Cloudflare·D1·토큰·동기화 요청이 없습니다.

### 번역과 Git 관리

`src/i18n/en.json`은 한국어 원문을 키로 사용하는 영어 번역 모음입니다. `src/i18n/index.ts`는 언어 선택·변수 치환·오류 표시를, `src/ui/i18n.tsx`는 React 화면의 언어와 표시 형식을 담당합니다. Firefox 메타데이터 번역은 `public/_locales/ko/`와 `public/_locales/en/`에 있습니다. 문구를 추가할 때는 영어 번역과 두 언어의 동작을 함께 확인하세요.

로컬 Git 저장소의 기본 브랜치는 `main`입니다. `node_modules/`, `dist/`, `artifacts/`, `.tmp/`, `_workspace/`, `.playwright-mcp/`, 로그·커버리지·`.env*`는 추적에서 제외합니다. 원격 저장소는 아직 연결하지 않았습니다. `git status`로 변경 파일을 확인한 뒤 필요한 시점에 첫 커밋을 만드세요.

### 검증 결과와 남은 확인

실제 관측 결과는 [docs/QA.md](docs/QA.md)에 기록합니다. 타입·린트·도메인 테스트와 실제 Firefox 확장 설치 검증은 서로 구분합니다.

현재 사용한 React 배포 번들에서 `web-ext lint`의 `UNSAFE_VAR_ASSIGNMENT` 경고 2개가 발생합니다. React DOM 자체의 `innerHTML` 구현에 대한 경고이며 이 앱은 `dangerouslySetInnerHTML`이나 사용자 HTML 삽입을 사용하지 않습니다. 경고를 표시한 채 검사하며 메모에 HTML을 입력했을 때 텍스트로만 표시되는 것도 Firefox에서 확인했습니다. 라이브러리 경고를 숨겨 서명 승인을 보장하지 않습니다.

실제 로그인한 Play Books의 서재 가져오기·읽기·포커스 전환·절전·Google 화면 개편 대응, OS 알림의 실제 클릭, 서명본의 상시 설치와 시작 알림은 후속 실사용 확인이 필요합니다.

---

<a id="english"></a>

## English · One page a day

ReadChime is a local reading habit extension for **Firefox on desktop**. It combines a personal library, reading reminders, a conservative reading timer, manual entries, and statistics. Defaults are **22:00 device local time**, a **5-minute daily goal**, **open the book directly**, and **show a reader start prompt**. Time is recorded only after pressing Start. The interface supports Korean and English.

Your library, completed sessions, and settings stay in `browser.storage.local` in the current Firefox profile. There is no server, account, telemetry, or synchronization. The dashboard and backups work offline. Opening a Play Books book requires internet access and the appropriate Google access to that book.

### Language settings

Open **Dashboard → Settings → Language / 언어**, choose **System (Firefox language)**, **한국어**, or **English**, then press **Save settings**. System is the default: Korean Firefox uses Korean; other browser languages use English. The preference applies to the popup, dashboard, notifications, errors, accessibility labels, and date/number display, and persists across restarts. It does not change reminder schedules or recorded reading dates.

The preference is part of the settings in JSON backups. Older backups without a language field default to System. Merge keeps your current settings unless you opt into imported settings; replacement applies the imported settings. Book titles, authors, notes, and titles saved in historical entries are never translated.

The extension name, description, and default toolbar title use Firefox's display language, which may differ from a manual app language selection. Browser and operating system dialogs, including login, permissions, and file pickers, use their own language settings. See [Mozilla's internationalization guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization) and [`getUILanguage()` documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/i18n/getUILanguage).

### Quick start

Use **Node.js 22.19.0 or later** and **Firefox 140 or later**. The earlier verification recorded Windows, Node.js 24.20.0, and Firefox 158.0.1; see [QA records](docs/QA.md) for the actual checks and their limits.

```powershell
npm ci
npm run check
```

`check` runs TypeScript, ESLint, unit/integration tests, the production build, packaged resource checks, and Firefox extension linting.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Select **Load Temporary Add-on**.
3. Choose **`dist/manifest.json`** from this project.
4. Open ReadChime from the extensions menu. Use **Dashboard ↗ → My library → Add book**.
5. Allow Play Books access. Book tabs already open before installation may need a refresh.

The dashboard is the extension's internal `dashboard.html`. Open it from the popup; you do not need a development server or to open source HTML directly.

**Temporary installations are removed when Firefox restarts.** For daily use, install a Mozilla-signed XPI. The extension uses the stable ID `readchime@local.invalid`, but observations about data retained during temporary installation do not guarantee data retention during normal installation or removal. [Mozilla's temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

### Development commands

| Command                        | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm ci`                       | Install the exact dependencies from the lockfile                                                      |
| `npm run dev`                  | Vite UI preview with empty state; extension APIs and persistence are unavailable                      |
| `npm run dev:extension`        | Watch and rebuild the extension files                                                                 |
| `npm run firefox`              | Temporarily install `dist/` in a separate development profile; wait for a build first                 |
| `npm run build`                | Build the popup, dashboard, background/content scripts, and local assets; check resource paths        |
| `npm run typecheck`            | Strict TypeScript checking                                                                            |
| `npm run lint`                 | ESLint                                                                                                |
| `npm test`                     | Domain, background, content script, and localization tests                                            |
| `npm run test:watch`           | Rerun Vitest as files change                                                                          |
| `npm run validate:firefox`     | Run `web-ext lint` on `dist/`                                                                         |
| `npm run test:firefox`         | Headless Firefox installation, UI, storage, backup, and restart smoke tests in an isolated profile    |
| `npm run test:firefox:library` | Library detection, tab selection, and selected import using synthetic library DOM in isolated Firefox |
| `npm run test:firefox:reader`  | Reader URL matching, page prompt, trusted Start click, and session switching with synthetic reader DOM |
| `npm run test:firefox:i18n`    | Korean/English settings, screens, popup, errors, backup, and persistence smoke tests                  |
| `npm run check`                | Typecheck, lint, tests, build/resource checks, and Firefox lint                                       |
| `npm run package`              | Rebuild and create an unsigned ZIP in `artifacts/`                                                    |

Firefox smoke tests download GeckoDriver on first use, so the first run requires network access. If Firefox is installed elsewhere, set `$env:FIREFOX_BINARY = 'path\to\firefox.exe'`. Test logs, screenshots, and isolated profiles go into `.tmp/`; the tests do not use your real Firefox profile or Google account. Firefox 158+ privileged-page automation settings apply only to the test process and its children.

### Add books and start reading

Open an actual book in Play Books and copy its reader URL:

```text
https://play.google.com/books/reader?id=BOOK_ID
```

Enter the title yourself; author, URL, and notes are optional. The homepage, store detail pages, HTTP URLs, other hosts, and URLs containing user credentials are rejected as reader URLs. Saved URLs retain the book ID in a canonical form, so page and tracking parameters do not create duplicate tabs.

**Set as current book** gives an unfinished book first priority. Otherwise, ReadChime chooses the most recently read unfinished book, then a book marked Reading, then To read. Finished, On hold, and removed books are excluded. If no reader URL is available, the library opens. ReadChime does not query account APIs or assume that a book is accessible.

**Start reading** opens or focuses the book tab and links the timer to it. If reader detection fails, you can explicitly select **I am reading in this tab** and try again. The tab must still have a valid reader URL with the matching book ID. A homepage cannot start the timer.

Opening a Play Books reader automatically selects the saved book by matching the URL's Google book ID, ignoring page and tracking options. Existing titles, authors, and notes are kept. A new book is added only after supported outer reader structure is detected. If its title is unavailable, a temporary ID is kept and enriched later without overwriting a user-edited title.

A start popup opens once for a newly encountered reader. If Firefox cannot open the toolbar popup automatically, the same start prompt appears at the top right of the book page. **No time is recorded before you press Start.** Completed, paused, and removed books retain their status until you explicitly choose **Resume reading**. Turning off reader prompts does not disable automatic book selection or manual Start. A legacy enabled auto-start setting never starts recording without a click.

### Import selected books from Play Books

Choose **My library → Import from Play Books**. Manual book creation and editing remain available.

1. With one Play Books library tab open in the same Firefox, ReadChime scans that tab. If several are open, choose one; **View tab** lets you inspect it first.
2. If no library tab exists, ReadChime opens Play Books and shows instructions. Sign in, prepare your library, return to the dashboard, and scan again. It does not wait for login and then run automatically.
3. The preview reads titles, authors, and reader URLs from the currently loaded library grid. Previewing does not add books to your saved library.
4. Choose individual books or **Select all new books**, then **Apply selected books**. Restoring removed books and filling missing authors require individual selection.

Scanning runs only when you open the import dialog or press its scan controls. Visits, DOM changes, browser startup, and scheduled alarms do not trigger library collection. This is separate from detecting the single book in the current reader tab.

Only the **currently loaded list** is in scope. Off-screen cards already in the DOM can be included, but ReadChime does not click Google's next-page or Show all controls. Prepare the desired list yourself and scan again. The preview reports pagination controls, invalid/duplicate cards, and whether the 2,000-card limit was reached. It distinguishes login required, loading, unsupported pages, and an empty current list. Public recommendations and store lists are not treated as your library.

Duplicates are identified by **Play Books book ID**, not by title. An address-free manual book with the same title is not merged.

| Preview status      | What applying the selection does                                                        |
| ------------------- | --------------------------------------------------------------------------------------- |
| New book            | Add with a new UUID and To read status                                                  |
| Already in library  | Keep existing information; do not add another copy                                      |
| Author can be added | Fill only an empty author, if selected                                                  |
| Removed book        | Restore only if selected, preserving its UUID, history, and previous reading status     |
| Duplicate           | Report multiple existing UUIDs for one Play Books ID; do not add or merge automatically |

Existing titles, notes, statuses, current-book choice, and reading history are kept. Books missing from a scan are not deleted or hidden. State is checked again immediately before applying a selection so intervening manual changes are not overwritten.

Previews expire after 10 minutes. Recent results live in extension session storage, separate from the permanent library, and can survive a background event-page suspension. A new scan replaces the old result; closing the browser requires another scan. Previews are excluded from backups. [Mozilla's session storage documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session)

Detection rules originated from supplied library HTML. Current automated tests use synthetic DOM; the current signed-in Google library has not been verified. A Google layout change can therefore cause an unsupported-page message. ReadChime does not read book contents, cookies, login tokens, or account information, and does not call private account APIs.

### What the timer measures

- Time counts while the linked book tab is selected in a non-minimized window and the page reports itself visible, including when taking notes in another app. Detecting complete coverage by other applications is not guaranteed.
- Switching tabs, minimizing, or hiding the page starts a 5-second grace period. Returning within it continues automatically, excluding hidden time. After 5 seconds, or after a manual pause, use **Resume reading** at the top right of the book page. The card collapses to a small resume button and works even with start prompts disabled.
- Reloading, visiting the library, or directly selecting another tab of the same book preserves the session and the same grace period. Merely visible books in other windows never take over the session.
- Mouse and keyboard activity are not used to infer reading; you can read without interacting.
- Content observations arrive about every 5 seconds. Wall time, a monotonic clock, and document tokens are compared, and only confirmed intervals are saved. Background `setInterval` is not the time source.
- An observation gap over 12 seconds, a clock reversal, clock disagreement, or a time zone change makes the interval uncertain. Unconfirmed time is excluded. Recovery after browser startup, tab closure, or extension reload keeps confirmed records only.
- A few seconds after the last observation or near a focus change can be missed. Sleep and human attention cannot be measured perfectly. Entries are labeled **Estimated timer** and can be corrected.
- Only one timer runs at a time. Sessions shorter than 5 minutes count; reaching the daily goal does not stop the timer. Sessions below one second are not recorded.
- Recording always requires a Start button press. Stopping does not repeatedly reopen the start prompt on the same reader. Refreshing or switching tabs does not undo a pause. Opening another book saves the previous confirmed intervals and waits for Start for the new book.

See [detection evidence and limits](docs/DETECTION.md) for the selectors and unverified cases.

### Reminders

Daily reminders use a named, one-shot `browser.alarms` alarm for the next **device local time**. Scheduling is checked at installation, startup, settings changes, reminder delivery, and UI use. A one-minute reconciliation alarm repairs missing schedules and checks time zone/clock changes. Delivery at the exact second is not guaranteed. [Mozilla's alarm documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms)

- **Open directly:** open the recommended book or focus a matching tab. Opening a tab is separate from starting its timer.
- **Gentle reminder:** display a basic notification; clicking its body opens the book. Unsupported notification action buttons are not created. Open, Snooze, and Skip today controls live in the popup/dashboard.
- The daily reminder is skipped if the goal is already reached or a timer is running. Manual entries count toward the goal.
- If Firefox was closed at the scheduled time, a missed reminder can be delivered at startup within the default 120-minute grace period. It expires at midnight. ReadChime cannot launch Firefox itself.
- Scheduled reminders are processed once per day. An explicitly requested snooze is an exception, but cannot cross midnight. Skip today also cancels that day's snooze.
- Delivery state is saved first to prevent duplicates. A crash immediately afterward or OS notification blocking can therefore lose a reminder. ReadChime does not repeatedly reopen tabs through automatic retries. Use **Test reminder with saved settings** to check the selected behavior.

### Manual reading on tablets, phones, or paper

Use **Reading history → Log reading time** to enter the book, date, duration, device, and notes. Durations under 5 minutes are allowed; future dates are rejected. Review the day's existing total and confirm that the entry is **additional reading that does not overlap with time already logged**.

A date and duration cannot automatically establish real-world overlap. If you read 20 minutes total, including 8 minutes already timed, enter 12 additional minutes. Backups deduplicate identical IDs, but you must identify real-world duplicate reading saved under different IDs.

Manual entries have **date precision**, not known start/end times. Their ISO start/end fields use the same midnight anchor on the selected date; these fields do not claim actual reading times. Statistics use explicit `localDate` and `durationSeconds`. Timer sessions split observed intervals by local date and preserve the time zone recorded then. Later time zone changes do not move historical calendar entries.

Removing a book normally removes it from the library only; history and the title captured in each entry remain. To permanently delete it, filter Reading history to that removed book, review the linked entry count, and confirm permanent deletion.

### Statistics and goals

The dashboard shows today's total, this week from Monday, this month, 7/30-day charts, a 13-week calendar, and all-time totals by book and device. Averages and completion rates include days without records. Charts also provide a numeric daily table.

Goal changes apply from today onward and retain historical goals. Editing past entries recalculates completion using the goal in effect that day. A timer crossing midnight creates separate local-date entries. Empty screens show zero and empty states; no sample reading data is inserted automatically.

### Backup, restore, and data safety

In Settings, choose **Download JSON backup**. A backup includes books, settings, goal history, and completed entries. It excludes an active timer and daily reminder-delivery state. Stop an active timer before importing. Backups are unencrypted and contain titles and notes. **Back up before removing the extension or deleting a Firefox profile.**

Selecting a backup validates its format, version, dates, times, IDs, book references, and reader URLs before showing a preview. The maximum size is 25 MB.

- **Merge:** add new IDs, skip identical items, and keep current values for conflicting IDs by default. You may select imported values per conflict. Current settings and goal history are kept unless you choose to apply imported settings.
- **Replace all data:** display the current book/entry counts and require explicit confirmation before replacement. Imported settings and goals are applied too.
- Import is rejected while a timer is active or if data changed after the preview. Select the file again and review the updated preview.
- All writes are serialized by the background, validated, and committed under one root key. Failed storage writes retain the previous in-memory state.
- The state schema is version 2. Version 1 migration adds reading dates, measurement types, and goal history. Since version 1 lacks the original time zone, it explicitly migrates dates using UTC. Unknown future versions and damaged data are not overwritten. Adding the optional language preference does not require changing the schema version.

### Permissions and privacy

| Permission                       | Use                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `storage`                        | Library, settings, records, and recovery checkpoints                              |
| `alarms`                         | Daily reminder, snooze, and schedule reconciliation                               |
| `notifications`                  | Gentle reminders                                                                  |
| `https://play.google.com/books*` | Reader URLs/outer structure, and book metadata from a library page when requested |

ReadChime does not request the broad `tabs` permission, cookies, downloads, or web-request interception. Firefox may describe host access at the domain level, but content scripts attach only to the declared paths. All executable JavaScript and CSS are packaged locally; the extension-page CSP blocks network connections. ReadChime does not inspect the book-content iframe or bypass DRM.

### Packaging and signing for daily use

```powershell
npm run package
```

The ZIP in `artifacts/` is an **unsigned development package**, not a signed extension ready for permanent installation in standard Firefox. Obtain unlisted signing through Mozilla's developer hub for private distribution; a public listing is unnecessary. [Mozilla's signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

Submission may require both the package and reproducible build source. Reproduce the build with `npm ci` followed by `npm run build`. Do not include user-supplied account HTML/assets, `.tmp/` profiles, personal backups, or secrets in submission source. Runtime dependency copyright/license notices are generated in `dist/THIRD_PARTY_NOTICES.txt`.

### Project structure

```text
src/
  domain/       Models, URL validation, reader/library detection, timer, scheduling, statistics
  data/         Validated local repository, migrations, JSON backup/merge
  background/   Serialized commands, Firefox events, reminders, library import
  content/      Reader observations and explicitly requested library scans
  shared/       Validated runtime message contracts
  i18n/         Language resolution, English catalog, error localization
  ui/           React popup/dashboard, dialogs, locale provider, styles
public/
  manifest.json
  _locales/     Korean/English Firefox metadata
  icons/
tests/          Domain/integration/localization tests and synthetic fixtures
scripts/        Build/resource checks and isolated Firefox smoke tests
docs/           Detection evidence and QA records
dashboard.html / popup.html
dist/           Generated extension; load its manifest in Firefox
artifacts/      Generated unsigned distribution ZIP
```

The original two supplied Play Books HTML files are absent from this checkout. Automated tests use synthetic DOM from `tests/fixtures.ts`; these fixtures do not replace original saved-page or authenticated live verification. A future storage adapter can be added at the existing `StorageAdapter` boundary. The current code has no Cloudflare, D1, tokens, or synchronization requests.

### Translation and Git maintenance

`src/i18n/en.json` maps Korean source messages to English. `src/i18n/index.ts` resolves language, interpolates values, and localizes errors. `src/ui/i18n.tsx` supplies React language/display formatting. Firefox metadata lives in `public/_locales/ko/` and `public/_locales/en/`. Add English copy for new source messages and check both languages.

The local Git repository starts on `main`. `.gitignore` excludes `node_modules/`, `dist/`, `artifacts/`, `.tmp/`, `_workspace/`, `.playwright-mcp/`, logs, coverage, and `.env*`. No remote is configured. Review `git status` and create the first commit when ready.

### Verification and remaining checks

[QA records](docs/QA.md) distinguish static/unit checks from installation in real Firefox. Passing the build does not establish that the current authenticated Google UI works.

The bundled React DOM currently produces two `UNSAFE_VAR_ASSIGNMENT` warnings in `web-ext lint` for its internal `innerHTML` implementation. ReadChime does not use `dangerouslySetInnerHTML` or insert user HTML. Prior Firefox QA checked that HTML-like notes render as text. The warnings remain visible and do not imply Mozilla signing approval.

Authenticated Play Books import and reading, focus/sleep behavior against the current Google UI, real OS notification clicks, and permanent signed installation/startup reminders still require practical verification. [Back to 한국어](#korean)
