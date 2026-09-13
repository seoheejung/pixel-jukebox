# Game Boy LCD 화면 리디자인 결과

## 구현 결과

- 본체 아래의 기능 카드를 제거하고 Now Playing, Playlist, AI Picks, Add Music, Settings를 `#lcd-screen` 안의 화면으로 통합했다.
- 순수 navigation reducer로 화면 기록, 뒤로 이동, 선택 이동과 범위 보정을 관리한다.
- D-pad, A/B, SELECT/START, 키보드와 화면 버튼이 같은 전이 함수를 사용한다. 입력 필드에서도 Enter는 A, Escape는 B와 같은 동작을 호출한다.
- Add Music, Appearance, OpenAI 화면에서 A가 각각 제출, 저장, 연결을 실행한다.
- Now Playing을 떠날 때 재생을 일시정지하며, 돌아온 뒤에는 A를 눌러야 재생한다.
- Appearance의 미저장 미리보기는 B, SELECT, START로 화면을 떠날 때 저장된 설정으로 복원한다.
- 플레이어 iframe을 화면 전환 중 재생성하지 않으며, player root가 Document PiP로 이동할 때도 root 이벤트와 소유 document 이벤트 연결을 유지한다.
- 기존 origin 검증, metadata/playback 상태, playlist 저장·순서 변경, AI 추천 검증, 세션 OpenAI 연결과 PiP 복원 경로를 유지했다.
- 확장 아이콘이 `sidepanel.html`을 작은 action popup으로 열도록 manifest를 바꾸고 불필요한 `sidePanel` 권한과 background 클릭 핸들러를 제거했다.
- popup을 360px 폭, 최대 600px 높이에 맞게 압축하고 Game Boy 하단 장식 곡선을 제거했으며 Appearance의 SAVE 버튼을 LCD 색상 체계로 통일했다.
- action popup의 `max-width: 100vw`가 초기 viewport와 순환 계산되어 폭이 가느다란 strip으로 축소되던 문제를 제거했다. popup `html/body`는 360px 고유·최소 너비를 사용하고, 별도 창과 Document PiP만 유동 폭을 사용한다.
- 컨트롤 데크를 기준 Game Boy 배치에 맞춰 다시 구성했다. D-pad와 사선 A/B recessed 그룹은 상단에, SELECT/START는 하단 중앙에 함께 두고, 고정 폭 스피커 슬릿은 별도 우하단 영역에 배치해 360px와 380px에서 라벨과 겹치지 않게 했다. A/B 원형 버튼은 무문자 표면으로 두고 B/A 라벨을 버튼 아래에 표시한다.
- Now Playing에 이전 곡, 한 곡 반복, 다음 곡 버튼을 노출했다. 한 곡 반복은 종료 시 현재 곡을 다시 로드하며, 메뉴를 보고 있을 때 곡이 끝나면 자동 재생하거나 Now Playing으로 강제 이동하지 않는다.
- action popup을 닫으면 해당 문서와 iframe이 종료되어 재생도 멈춘다. Settings의 Open Window는 380×650px 독립 창을 Home에서 새로 열고, 성공한 뒤 기존 popup 재생을 pause하고 popup을 닫는다. 현재 곡과 재생 위치는 새 창으로 이전하지 않는다.

## 검증 결과

아래는 화면 리디자인 당시의 기록이다. 2026-09-11 후속 작업에서는 전체 테스트 7개 파일·48개, 타입 검사·빌드·Bridge·manifest 검사가 통과했다. 추천 UI의 기준 곡·진행 단계·Retry·픽셀 로딩 및 모션 감소 확인 항목도 Chrome fixture에 추가했다. 상세 기록은 [추천 후속 검증](ai-similarity-diagnostics.md#2026-09-11-후속-검증)을 참고한다.

- `npm test`: 성공, 7개 테스트 파일의 44개 테스트 통과
- `npm test -- --run tests/connections.test.ts tests/core.test.ts`: 별도 창 URL 경계와 repeat-one을 포함한 11개 테스트 통과
- `npm run typecheck`: 성공
- `npm run build`: 성공, Vite production build 생성
- `npm run check:bridge`: 성공
- `npm run check:manifest`: 성공, source manifest 최소 권한과 build entry 확인
- `git diff --check`: 성공

## Chrome 확인 상태

`npm run test:chrome:ui`는 외부 네트워크 없이 실행하도록 로컬 player bridge fixture를 사용하며 다음 항목을 검증하도록 작성했다.

- 320px, 390px, 480px 레이아웃과 8개 물리 컨트롤 배치
- D-pad/A/B/SELECT/START, 키보드, body 포커스와 입력 필드 전이
- Add Music 제출, Appearance 저장·취소 복원, OpenAI 연결 요청
- 메뉴 진입 시 pause, Now Playing 복귀 후 A 재생
- 화면 전환 전후 iframe DOM identity 유지

현재 Windows Chrome 환경에서는 browser flat session과 page target WebSocket 직접 연결 모두 타깃 연결에는 성공했지만 첫 session 명령인 `Network.enable`이 30초 후 timeout 되었다. 실패는 UI assertion과 화면 캡처 전에 발생했으므로 오프라인 Chrome 항목은 완료로 판정하지 않았다.

2026-09-11 재실행은 DevTools WebSocket 연결 중 `ErrorEvent`로 UI assertion 전에 종료됐다. 앞 문단의 timeout은 이전 실행 기록이며, 최신 실행에서도 실제 화면 검증은 완료되지 않았다.

이 오프라인 fixture는 실제 YouTube 재생·metadata 응답, OpenAI 네트워크 요청과 권한 UI, Document PiP 창 생성 및 운영체제 창 동작을 검증하지 않는다. 해당 항목은 정상 CDP 세션과 외부 서비스 접근이 가능한 Chrome 환경에서 별도로 확인해야 한다.
