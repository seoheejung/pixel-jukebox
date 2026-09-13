# Phase 2 — Game Boy Material / Motion / PiP

## 학습 목표

Game Boy 본체와 실제 조작부를 화면 중심에 배치하고, 플레이어를 방해하지 않는 재질·인터랙션과 PiP 영상 이동 구현.

## 실습

### 1. 본체와 조작부

`sidepanel.html`, `src/sidepanel/player.ts`, `src/sidepanel/style.css`에서 회색 DMG 본체, 화면 베젤, LCD 정보 영역, 왼쪽 십자키, 대각선 B/A 버튼, SELECT/START와 스피커 홈을 구성했다. URL 입력·Playlist·AI·설정은 본체 아래 보조 영역에 배치했다. Shell / Screen / Button 색상과 Design SAVE, Compact AI PICKS, OpenAI CONNECT를 유지하고 Export는 추가하지 않았다.

### 2. 절제된 Material / Motion

버튼 Press, 드래그 중인 Playlist 행의 1.5도 기울기와 그림자, 36px 미니 Disc의 가속·감속을 추가했다. 금속·유리 표현은 본체와 베젤 가장자리의 약한 하이라이트로 한정했다. 실제 영상 위에 반사 레이어를 덮지 않는다.

AI 카드는 정보 버튼으로 뒤집어 기존 곡 정보와 Playlist 상태를 확인한다. 추가 버튼과 상세 조작을 분리하고, 숨겨진 면에 `inert` / `aria-hidden`을 적용한다. Escape로 앞면에 복귀한다. 홀로그램은 정밀 포인터 Hover 중에만 표시하며 상시 애니메이션을 사용하지 않는다.

Motion 감소 설정 변경과 화면 밖 이동 시 Disc 프레임 요청을 중단한다. PiP 이동 시 관찰 대상·문서 이벤트·프레임 요청을 다시 연결한다.

### 3. 실제 Player PiP

`src/sidepanel/pip.ts`에서 컨트롤러 복제 대신 영상이 포함된 Player를 PiP 문서로 이동한다. 열기 중복 요청을 합치고 기존 창을 재사용한다. 원래 위치에는 복귀 버튼을 표시하며, 창이 닫히면 한 번의 DOM 이동으로 복원한다. PiP에도 저장된 디자인을 적용한다.

`src/shared/player-bridge.ts`와 `player-bridge/player.js`에 선택적 `currentTime` / `startSeconds` 필드를 추가했다. iframe 재로딩 후 같은 곡·재생 위치·일시정지 의도를 복원한다. 오래된 영상의 상태·오류 메시지는 새 영상에 반영하지 않는다.

Document PiP는 별도 문서를 사용하며 `moveBefore()`는 문서 간 이동을 지원하지 않으므로, iframe 이동 후 재초기화와 위치 복원이 필요하다. [Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture), [moveBefore 제약](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore).

## 확인 결과

2026-09-09 로컬 검증:

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 6 files, 38 tests |
| `npm run build` | PASS |
| `npm run check:bridge` | PASS |
| `npm run check:manifest` | PASS |
| 변경 파일 `git diff --check` | PASS |

위 단위 테스트 통과만으로 시각 효과와 실제 PiP 동작을 검증한 것으로 보지 않는다.

오프라인 Chrome 검증은 환경 문제로 완료하지 못했다. 외부 DNS를 차단한 새 프로필에서 Extension 페이지가 `about:blank` 로딩에 멈추며 CDP 연결을 완료하지 못했다. 한 차례의 localhost 대안도 DOM 검사 전에 `Target crashed`를 반환했다. 따라서 스크린샷, 320 / 390 / 480px 실제 넘침, PiP 열기·재사용·복원 및 효과의 브라우저 동작은 미검증이다. 생성한 Chrome 인스턴스와 디버깅 포트는 모두 종료했다. 하네스는 `.chrome-test` 안에만 작성했고 외부 네트워크 요청은 수행하지 않았다.

실제 OpenAI·YouTube 호출은 미검증이다. 재생 위치 복원 필드는 로컬 Bridge에 구현했으며, 운영 HTTPS Bridge에 적용하려면 별도 배포가 필요하다. 배포와 외부 네트워크 검증은 수행하지 않았다.
