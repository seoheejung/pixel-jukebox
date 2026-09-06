# Phase 1 — YouTube Player

## 구현 범위

Video ID 기준 Track 감지, 제목·채널·썸네일·재생 상태, YouTube SPA 전환, 탭별 상태와 선택한 탭의 Controller, LP/CD 렌더링을 구현했다. Playlist·Design 설정·Export·PiP·AI는 포함하지 않았다. 기본 화면은 LP이며 사용자 LP/CD 설정은 이 Phase에 추가하지 않았다.

## YouTube DOM 실측

`npm run chrome:inspect-youtube`를 실제 Chrome 152.0.7977.76에서 실행했다. 로그인하지 않은 전용 프로필의 `https://www.youtube.com/watch?v=dQw4w9WgXcQ`에서 다음 구조를 관찰한 뒤 Selector를 작성했다.

| 관찰 대상 | 확인된 구조 |
|---|---|
| 현재 영상 컨테이너 | `ytd-watch-metadata[video-id]`, `ytd-watch-flexy[video-id]` |
| 제목 | `ytd-watch-metadata h1` |
| 채널 | `ytd-watch-metadata ytd-channel-name a` — Rick Astley |
| Thumbnail | `meta[property="og:image"]`, `https://i.ytimg.com/vi/<videoId>/maxresdefault.jpg` |
| 실제 미디어 | `#movie_player video.html5-main-video` |
| 이전/다음 | `#movie_player .ytp-prev-button`, `.ytp-next-button`, `aria-disabled` |

초기 document ready 시점과 YouTube 메타데이터 준비 시점이 다름을 관찰했다. URL과 컨테이너의 Video ID가 같고 제목·채널이 존재할 때만 Track을 전송한다. 다른 Video ID의 썸네일은 재사용하지 않는다. MutationObserver, 미디어 이벤트, `yt-navigate-finish`, `popstate` 및 1초 상태 확인으로 갱신한다. 이벤트는 실제 Next SPA 이동에서도 관찰했다.

## 실행 결과

| 명령 | 실제 결과 |
|---|---|
| `npm run chrome:inspect-youtube` | 실제 YouTube DOM, 미디어 상태, 버튼과 메타데이터 확인 |
| `npm run build` | 두 Vite 빌드 성공 |
| `npm run typecheck` | 성공 |
| `npm test` | 2개 파일·26개 테스트 통과 |
| `npm run check:manifest` | 기존 최소 권한과 빌드 산출물 검사 통과 |
| `npm run test:chrome` | 실제 YouTube Play/Pause·Previous/Next, SPA·Back/Forward·자동 이동, 두 탭 분리 통과 |

Chrome 테스트는 CDP로 실제 Side Panel action과 Controller 버튼을 조작했다. 자동 이동은 실제 미디어를 종료 0.5초 전으로 탐색한 후 YouTube의 Mix 자동 이동을 확인했다. 가짜 ended 이벤트를 전송하지 않았다. Browser history 이동 전후 Video ID와 Panel 상태를 비교했다. LP/CD 전체 화면 캡처를 확인했다. CD는 렌더링 속성을 테스트에서 변경하여 확인했으며 Design 설정 UI는 없다.

테스트 도구가 Panel DOM 생성 전에 요소를 조회하던 경합은 요소 준비를 기다리도록 수정하고 재실행했다. 최종 Chrome 명령은 종료 코드 0이다.

## 확인 결과

- [x] 최초 영상 감지 및 Video ID / Title / Channel / Thumbnail 수집 — 실제 Chrome
- [x] SPA 전환 감지와 Side Panel Track 갱신 — 실제 Next, Previous, Browser Back/Forward, 자동 이동
- [x] Play/Pause 상태 갱신 — 실제 미디어와 Panel 비교
- [x] 재생 중 Rotation / Pause 시 Rotation 정지 — 실제 CSS animation 상태 비교
- [x] 기본 Previous / Play-Pause / Next Controller — 실제 YouTube Mix
- [x] 여러 YouTube Tab 상태 혼선 없음 — 두 탭에서 선택한 탭만 재생됨을 확인
- [x] Phase 2 이후 기능 선반영 없음

## 경계 및 미확인 범위

Vitest는 입력 검증·SPA 중간 상태·재생 제어 및 탭별 메시지 경계의 Mock 테스트다. 실제 Chrome 결과와 분리했다. YouTube는 외부 DOM을 변경할 수 있으므로 이 실측이 모든 향후 레이아웃의 호환성을 보장하지 않는다. 일반 watch 페이지에서 native Previous가 비활성인 경우 Panel도 비활성으로 표시한다.

추가 의존성·Chrome Permission 없음. Public API 변경 없음.
