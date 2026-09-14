# 음량·광고 건너뛰기

## 최종 사용자 확인 — 2026-09-13

사용자가 실제 YouTube 광고의 자동 건너뛰기 동작을 확인했다. 아래 이전 절의 미확인 표기는 각 수정 당시의 기록이며, 이번 사용자 확인으로 갱신한다.

- UI와 콘텐츠 스크립트 모두 `debugger-v3`, 등록 파일 `youtube-controls-v3.js`, 연결·Auto Skip·debugger 권한 모두 정상. 이전 연결 메시지는 0회였다.
- 진단 순서: 버튼 후보 1개가 크기 0인 동안 대기 → 입력 시도 1회와 `input-sent` → 버튼 후보 0개(`no-button`). 이후 Settings 이동으로 `settings-paused`가 기록됐다.
- `input-sent` 자체는 브라우저 입력 전달 성공만 뜻한다. 이번 결과는 그 이후 버튼 소멸 기록과 사용자의 실제 동작 확인을 함께 근거로 삼는다. Settings에서의 `playerVisible: false`와 `enabled: false`는 정상적인 일시 중지 상태다.
- 최종 수정 원인: 실제 팝업 sender에 없는 `frameId`·`documentId`를 필수로 요구해 정상 요청을 거절했다. 팝업에 맞는 검증과 debugger 입력으로 해결했다. 앞선 파일 등록 불일치도 확장 새로고침 후 해소됐다.
- 자동화 검증은 실제 action popup의 광고 fixture, 실제 광고 검증은 사용자 확인으로 구분한다. 모든 광고 유형이나 Document PiP까지 검증한 것으로 확대하지 않는다.

## 실제 action popup 요청 거절 수정

- 사용자 debugger-v3 보고서에서 버튼 탐지·시도 2회와 request-rejected를 확인했다. 실제 `chrome.action.openPopup()`으로 테스트 호스트를 확장한 결과 수정 전 자동 클릭 실패를 재현했다.
- 팝업 콘텐츠 스크립트의 실제 sender는 확장 ID와 YouTube origin은 정상이나 tab·frameId·documentId가 모두 없었다. 기존 테스트는 UI를 탭으로 열어 이 차이를 놓쳤다.
- 탭 요청의 검증은 유지하고, 탭이 없는 요청은 origin·URL·확장 ID 검증 후 실제 debugger 대상의 ancestry·일회성 버튼 토큰·표시·hit test로 제한한다. 임의 좌표나 코드를 요청에 받지 않는다.
- `node scripts/test-chrome-audio.mjs --popup`: 실제 action popup에서 수정 전 실패 → 수정 후 통과. 합성 클릭 거부 fixture, 음량·음소거, OFF·숨김·메뉴 제외, 진단 복사를 검증했다. 같은 명령을 `npm run test:chrome:audio:popup`으로 등록했다.
- 관련 단위 테스트 4개·타입 검사·빌드 통과. dist 반영 완료. 실제 사용자 YouTube 광고에서의 성공 여부는 별도 확인이 필요하다.

## 콘텐츠 스크립트 등록 버전 분리

- 실제 진단에서 UI debugger-v3와 contentBuild legacy-or-unknown이 함께 나타났다. 원본과 dist 스크립트 해시는 일치했지만 사용자 프레임의 새 코드 실행은 확인되지 않았다.
- 등록 파일을 `public/youtube-controls-v3.js`로 변경하고 이전 ready 메시지를 정상 연결로 수락하지 않도록 했다. 복사 정보에 등록 파일 목록과 legacyReadyCount를 추가했다.
- 타입·빌드·manifest·Chrome fixture 통과. 새 등록 파일과 contentBuild 확인, 이전 ready가 확인된 새 버전을 덮어쓰지 않는 검사를 통과했다. 실제 사용자 광고 해결은 미확인이다.

## 진단 이력 미수신 보완

- 실제 보고서는 connected·autoSkip·debuggerPermission이 true지만 history가 비어 있었다. 이는 탐지 실패의 증거가 아니라 진단 미수신 상태다. Settings의 playerVisible false는 정상이다.
- debugger-v3에서 콘텐츠 스크립트의 최신 진단과 버전을 ready 메시지에도 포함했다. 복사 결과에 contentBuild를 추가해 이전 스크립트 실행 여부를 구분한다. legacy-or-unknown은 새 버전을 선언하지 않는 스크립트의 연결을 의미한다.
- 타입 검사·빌드 및 Chrome fixture 통과. 별도 skip-diagnostics 메시지를 테스트에서 차단해도 ready 경로로 이력과 contentBuild가 전달됨을 확인했다. 실제 사용자 광고는 여전히 미확인이다.

## 실제 환경 진단 복사

- 사용자 환경에서 debugger 전환 후에도 광고가 지속되어 해결 완료로 간주하지 않는다. 기존 ON 표시는 요청 미발생과 입력 명령 전송을 구분하지 못했다.
- Settings에 `Copy skip diagnostics`를 추가했다. 사용자가 누르면 연결·권한·화면 상태와 최근 12개 탐지 상태 변화, 후보 수·제외 이유·시도 수·고정 오류 코드를 복사한다. 영상 URL, 곡명, API 키, 응답 원문은 포함하지 않는다. 상태는 메모리에만 유지한다.
- Service Worker 결과를 no-target / attach-failed / button-unavailable / input-failed로 구분한다. `input-sent`는 입력 명령 전달 성공이며 광고 종료 확인을 의미하지 않는다.
- 관련 단위 테스트 4개, 타입·빌드·문법·manifest 검사 통과. Chrome fixture에서 실제 콘텐츠 스크립트 메시지의 탐지·입력 결과가 복사 보고서에 포함되는지 확인했다. 테스트의 클립보드 쓰기는 mock으로 대체했다.
- 사용자 광고의 실패 단계는 복사 보고서 확인 전까지 미확정이다.

## debugger 브라우저 입력 전환

- 사용자 승인으로 `debugger` 권한을 추가했다. `public/youtube-controls.js`는 활성 버튼에 일회성 토큰을 부여해 Service Worker에 요청하며, `src/background/ad-skip.ts`가 발신 확장·embed origin·문서·프레임과 대상 ancestry·버튼 토큰·표시·비활성·hit test를 확인한다. 요청에는 임의 스크립트나 좌표를 받지 않는다.
- `Input.dispatchMouseEvent`의 누름·뗌 입력으로 기존 `.click()`을 교체했다. 완료·실패 시 디버거를 해제하며 동시 요청을 제한한다. OFF나 메뉴 이동 시 버튼 토큰을 취소한다. UI는 실패 시 Settings에 `ON · ERROR`를 표시한다.
- `npm run test:chrome:audio`: 합성 클릭을 명시적으로 거부하는 fixture에서 trusted 클릭 성공, 숨김·비활성·OFF·메뉴 상태 제외, 음량·음소거·설정 복구 검증 통과. 브라우저는 확장 자체의 debugger API를 실행하며 테스트 드라이버가 대신 광고 버튼을 클릭하지 않는다.
- 실제 사용자 광고의 성공 여부와 Document PiP의 debugger 입력은 미검증이다. DevTools나 다른 디버거 연결과의 충돌, Chrome의 디버깅 안내가 발생할 수 있다. `dist` 빌드와 확장 새로고침으로 적용하며 원격 브리지 배포는 필요 없다.

## aria-hidden 표시 판정 수정

- 사용자 확인상 버튼은 `#movie_player` 내부에 있다. 따라서 앞서 보완한 외부 배치 탐지는 이번 사용자 사례의 원인이 아니다.
- 코드가 부모의 `aria-hidden="true"`를 실제 숨김으로 간주해 클릭을 차단하는 결함을 확인했다. [MDN aria-hidden](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden)에 따라 접근성 노출 상태를 시각적 표시 판정과 분리했다. 속성을 변경하거나 제거하지 않고 클릭 제외 조건에서만 뺐다.
- 사용자 제공 HTML을 플레이어 내부의 aria-hidden 부모 아래에 놓은 Chrome fixture에서 수정 전 클릭 대기 실패, 수정 후 통과를 확인했다. CSS로 숨긴 경우 클릭하지 않는 검사와 기존 음량·OFF·비활성 검사도 통과했다.
- `node --check public/youtube-controls.js`, `npm run build`, `npm run check:manifest`, `npm run test:chrome:audio` 통과. dist 반영 완료.
- 전달받은 경고만으로 실제 버튼 조상의 aria-hidden 상태를 확정할 수 없다. 사용자 광고의 실제 해결 여부는 미확인이다.

## 제공된 버튼 HTML 및 검색 범위 보완

- 사용자가 제공한 `ytp-ad-skip-button-modern` 버튼은 기존 선택자와 일치한다. `ytp-ad-skip-button-container-detached` 클래스가 있으나 HTML 조각만으로 `#movie_player` 바깥 배치를 확정할 수는 없다.
- 해당 HTML을 `#movie_player` 밖에 둔 Chrome fixture에서 수정 전 클릭 대기 시간 초과를 확인했다. 광고 버튼 검색 범위를 ancestry 검증이 끝난 내장 YouTube 문서로 넓혔다. 기존 일반 YouTube 문서 제외와 숨김·비활성·OFF 검사를 유지한다.
- 수정 후 `npm run test:chrome:audio` 통과. `node --check public/youtube-controls.js`, `npm run build`, `npm run check:manifest` 통과. 실제 사용자 광고의 배치 및 클릭 성공은 별도 확인이 필요하다.

## 2026-09-13 표시 판정 회귀 수정

- `visibility: hidden`인 부모 안에서 버튼이 `visibility: visible`로 재정의된 경우, 기존 코드는 실제로 보이는 버튼도 클릭하지 않았다. Chrome fixture에 이 구조를 추가해 수정 전 클릭 대기 시간 초과를 재현했다.
- 버튼 자체의 최종 visibility를 검사하도록 수정했다. 부모의 display·opacity와 기존 비활성·숨김 검사는 유지한다. 실제로 숨김을 상속한 버튼은 클릭하지 않는다.
- 수정 후 `npm run test:chrome:audio` 통과. `node --check public/youtube-controls.js`, `npm run build`, `npm run check:manifest` 통과. dist 반영 완료.
- 사용자 광고의 실제 DOM은 미확인이다. 재현한 결함의 수정과 실제 광고 문제 해결 여부는 구분한다.

## 2026-09-13 탐지 보완

- 사용자 확인: 음량 조절 정상, 확장 새로고침 완료. 같은 연결로 설정이 전달되므로 버튼 탐지 문제를 우선 점검했다. 실제 광고 DOM에서 원인을 확정한 것은 아니다.
- `public/youtube-controls.js`: 기존 CSS 선택자에 더해 플레이어 내부 버튼의 한국어·영어 접근성 이름과 문구로 건너뛰기를 탐지한다. 카운트다운 문구는 새 탐지 경로에서 제외하고, 기존 숨김·비활성·투명도 검사를 유지한다. 문구와 접근성 속성 변경도 관찰한다.
- `scripts/test-chrome-audio.mjs`: 기존 클래스 없는 한국어 버튼, 영어 role 버튼, 카운트다운, 무관한 Skip intro 버튼에 대한 회귀 검증을 추가했다.
- 검증 통과: `npm run typecheck`, `npm run build`, `npm run check:manifest`, `node --check public/youtube-controls.js`, `npm run test:chrome:audio`.
- Chrome 테스트는 샌드박스 내 탭 생성 시간 초과 후 샌드박스 밖에서 통과했다. 실제 Chrome 확장 주입과 테스트용 광고 화면을 검증했으며, 실제 YouTube 광고에서의 성공 여부는 미검증이다.
- 새 코드는 `dist` 빌드에 반영했다. 사용 중인 확장을 새로고침하고 플레이어를 다시 열어야 적용된다.

2026-09-12 사용자 요청 구현.

- Now Playing 하단에 0–100 음량 슬라이더, MUTE/UNMUTE, 현재 값을 추가했다. 음량·음소거·자동 Skip 설정은 확장 origin의 localStorage에 저장한다.
- Settings의 Auto Skip Ads 기본값은 ON이다. 광고 재생 상태에서 실제로 표시되고 활성화된 Skip 버튼만 누른다. 건너뛰기 불가 광고를 강제 종료하거나 영상 시간을 이동하지 않는다.
- `public/youtube-controls.js`는 YouTube embed 문서에 주입되지만 정확히 이 확장 → 기존 HTTPS bridge → YouTube의 ancestry에서만 작동한다. 영상 DOM의 음량을 적용하므로 remote bridge 배포는 필요 없다. 콘텐츠 스크립트와 origin 검증은 API 키 저장 영역에 접근하지 않는다.
- 콘텐츠 스크립트 등록을 반영하려면 확장 프로그램을 다시 로드하고 플레이어를 다시 열어야 한다.
- [Chrome 콘텐츠 스크립트](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [HTMLMediaElement.volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume)을 사용한다.

## 검증

- `npm test`: PASS, 7 files / 57 tests. 아티스트 다양성 규칙에 대한 추천 요청 검증 포함.
- `npm run typecheck`, `npm run build`, `npm run check:manifest`: PASS.
- `npm run test:chrome:ui`: PASS, 기존 재생/추천/화면 전환, 360/390/480px 배치.
- `node scripts/test-chrome-audio.mjs`: PASS. 실제 unpacked 확장을 Chrome에 로드하고 HTTPS bridge/YouTube 요청은 fixture로 대체했다. 자동 콘텐츠 스크립트 주입, 실제 video.volume/muted 값, 음소거 해제 시 음량 복원, 문서 재로드·video 교체 시 설정 적용을 확인했다.
- 같은 브라우저 검사에서 숨김·비활성 Skip 제외, 활성 Skip 클릭, OFF/ON 전환, 일반 YouTube 문서 미적용, 동일 프레임의 위조 메시지 거절을 확인했다.
- 중첩 프레임 로딩 순서로 음량 연결이 초기화되던 문제는 주기적 연결 확인으로 수정했다. 광고 fixture는 실제 사용처럼 재생 화면이 보이는 상태에서 검사했다.
- 캡처: `.chrome-test/gameboy-volume.png`. 화면의 Skip Ad는 실제 광고가 아닌 fixture다.

실제 광고 송출·음원 청취·실제 AI 응답 품질은 미검증이다. YouTube가 Skip 버튼 DOM을 변경하면 탐지 규칙 보완이 필요할 수 있다. 배포와 의존성/lock 변경은 하지 않았다.
