# 메뉴·슬라이딩 Playlist·YouTube 출처 후속 수정

## 요청과 구현 기준

2026-09-12 사용자 요청을 기준으로 API Key 연결 성공 후 AI Picks 이동, Home의 Add Music/AI Picks 순서 변경, Playlist 제목 중심 방향키 이동, Now Playing의 하단 슬라이딩 목록, A/B 라벨과 LCD 여백을 수정한다. 세부 기준은 [화면 지침](../instructions/gameboy-screen-redesign.md)에 기록했다.

## YouTube 검색 출처

기존 파서는 모바일·음악 전용 YouTube 호스트와 `/embed/`, `/live/` 영상 주소를 영상 확인 전에 버릴 수 있었다. 정확히 허용된 HTTPS 호스트만 표준 영상 주소로 변환하고 기존 영상 ID·메타데이터 검증을 유지한다. 다른 도메인, HTTP 주소, 검색 결과·채널·Playlist 페이지를 영상으로 취급하지 않는다.

묶음 검색에서 직접 영상 주소가 없을 때 사용하는 곡별 프롬프트는 정확한 아티스트·곡명과 직접 영상 페이지를 요구하도록 보완했다. 같은 요청을 그대로 반복하지 않는다.

모의 응답은 지원 URL 형식, 이스케이프된 JSON URL, 잘못된 호스트·검색 결과 페이지 제외, 묶음 검색 실패 후 곡별 검색 성공을 검증한다. 사용자에게 표시된 과거 실패의 원본 응답이 없어 당시 원인을 확정하지는 않았다. 실제 OpenAI·YouTube 요청과 추천 품질은 미검증이다.

## 검증 기록

- 추천·Resolver 관련 테스트: `npm test -- --run tests/youtube-resolver.test.ts tests/recommendation.test.ts`, 2개 파일·19개 통과.

## UI 구현

- 직접 CONNECT 성공 시 AI Picks로 이동한다. 초기 연결 상태 수신만으로는 이동하거나 검색하지 않는다.
- Home에서 Add Music을 AI Picks보다 먼저 표시한다. Playlist의 방향키 대상에서 삭제 버튼을 제외하고 클릭·Tab 접근은 유지한다.
- Now Playing의 QUEUE 버튼으로 하단 목록을 열고 닫는다. 목록 열기는 재생을 멈추지 않으며, A로 선택·B로 닫기·방향키 이동을 지원한다.
- DOT MATRIX/BATTERY 표시와 LCD에 남은 toolbox 클래스를 제거하고 베젤 패딩을 맞춘다. A/B 라벨의 글자 굵기를 명시한다.
- 닫힌 목록은 `inert` 처리하고, 닫기 전에 목록 안에 포커스가 있었다면 QUEUE 버튼으로 복원한다.

## LCD 테마와 아이콘

전역 `section + section`의 여백이 LCD 하위 화면에도 적용되던 부분을 초기화했다. 입력창·주요 버튼·행 간격·글꼴을 LCD 색상과 크기로 통일하고 긴 Playlist와 슬라이딩 목록에는 얇은 테마 스크롤바를 적용했다.

전용 아이콘은 `public/icons/pixel-jukebox.svg`와 16/32/48/128px PNG로 제공한다. `node scripts/generate-icons.mjs`로 PNG를 생성하며 추가 의존성은 없다. Manifest/action과 문서 favicon에 연결하고 manifest 검사에서 PNG 크기와 빌드 포함 여부를 확인한다.

## 최종 검증 — 2026-09-12

| 명령 | 결과 |
| --- | --- |
| `npm test` | PASS — 7개 파일·55개 테스트 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run check:bridge` | PASS |
| `npm run check:manifest` | PASS — 소스·빌드·아이콘 크기/경로 |
| `npm run test:chrome:ui` | PASS — 제한 밖 로컬 Chrome, 모의 브리지·API 응답 |

Chrome에서는 360/390/480px의 다섯 LCD 화면, 키보드·물리 버튼 이동, 제목만 순회하는 Playlist, 10곡 목록의 스크롤바, 슬라이딩 목록 높이·선택·재생 유지·닫기, 연결 후 AI Picks 이동, LP 검색·진행·Retry·모션 감소, 380×650/720×940 크기의 확대를 검증했다. `.chrome-test/gameboy-*.png`에 캡처했다. 화면의 검은 영상 영역은 로컬 모의 브리지다.

기존 하네스는 `Page.enable` 없이 문서 초기화 스크립트를 등록해 Chrome 모의 API가 연결되지 않았다. Page 초기화를 추가하고 필수 영상 필드·읽을 수 있는 디자인 색상·추천 결과 URL 등 fixture를 실제 메시지 계약에 맞췄다. 이 변경으로 이전 Appearance·빈 목록 오류도 재현되지 않았다.

실제 OpenAI·YouTube 호출과 추천 품질, 운영체제 수준의 별도 창 생성과 Document PiP는 이번 fixture의 검증 범위에 포함하지 않는다. 기존 결과 문서의 실패는 당시 실행 기록이며 최신 UI 결과는 이 문서를 기준으로 한다.
