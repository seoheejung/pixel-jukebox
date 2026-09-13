# Game Boy LCD screen redesign

## 최신 요구사항

본체 아래의 YouTube Link, Playlist, AI Picks, Design, OpenAI Settings 카드를 제거하고 모든 기능을 LCD 화면 메뉴로 통합한다. Home 항목은 Now Playing, Playlist(count), AI Picks, Add Music, Settings다.

확장 아이콘은 side panel 대신 360px 폭의 작은 popup을 연다. popup은 600px 높이 안에서 스크롤 가능해야 하며 Game Boy 본체와 전체 기능을 유지한다. Now Playing에는 이전 곡, 다음 곡과 한 곡 반복을 화면 버튼으로 노출한다. popup 문서가 닫히면 재생도 끝난다는 수명 주기를 사용자에게 알린다.

## 조작 계약

### 2026-09-12 메뉴·Playlist 후속 요청

- 사용자가 API Key 연결을 완료하면 AI Picks 화면으로 이동한다. 초기 저장 상태 수신만으로 화면을 바꾸지 않는다.
- Home 순서는 Now Playing → Playlist → Add Music → AI Picks → Settings다.
- Playlist의 D-pad·방향키 이동은 곡 제목만 대상으로 한다. 삭제 버튼은 클릭·Tab으로 별도 접근한다.
- Now Playing에서 목록 버튼으로 LCD 하단 슬라이딩 Playlist를 열고 닫는다. 목록을 열어도 재생을 유지하며 곡 선택을 지원한다.
- 화살표 조작 전후 A/B 라벨의 굵기를 일정하게 유지한다.
- DOT MATRIX WITH STEREO SOUND와 BATTERY 문구를 삭제하고 LCD의 상하 여백을 정렬한다.
- 반복되는 YouTube 검색 출처 없음 오류는 URL 추출과 검색 방식으로 검증한다. 실제 URL·메타데이터 검증은 유지한다.
- Settings·AI Picks·Add Music·Playlist 버튼과 입력창을 LCD 테마로 통일하고 긴 목록에 얇은 테마 스크롤바를 적용한다.
- 전용 픽셀 아이콘을 16/32/48/128px로 제공하고 확장 action·manifest·문서 favicon에 연결한다.

### 2026-09-11 스크린샷 후속 요청

- 지원되지 않는 Mini Player는 비활성 버튼만 남기는 대신 메뉴에서 제외한다.
- Now Playing 제목·채널 글자 크기를 줄여 영상 영역을 확보한다.
- Open Window는 현재 기본 크기를 최소 레이아웃으로 유지하고, 창이 커질 때 본체와 LCD가 확장되도록 한다. 하단 배경색 단절과 불필요한 고정 여백을 없앤다.
- LP는 키보드로도 누를 수 있는 버튼으로 바꾸고, AI Picks 이동과 현재 곡 기준 검색을 연결한다. 기존 OpenAI 연결 조건과 중복 요청 방지를 유지한다.
- 추천은 검증된 서로 다른 5곡 확보를 목표로 후보와 보충 검색을 늘린다. 근거·영상 검증을 생략하거나 실패 시 곡을 만들어 채우지 않는다.
- 실패·완료 시 진행 표시를 숨겨 Retry와 검색 중 표시가 동시에 남지 않게 한다.

아래 기본 조작 계약은 계속 적용한다.

- SELECT: Home
- START: Settings
- D-pad: 메뉴 상하 이동; Now Playing 좌우 이전/다음
- A: 선택/확인; Now Playing 재생·일시정지
- B: 뒤로/취소
- Arrow keys, Enter/Space, Escape, Home과 클릭은 같은 상태 전이를 호출한다.
- 메뉴 진입 시 재생 중이면 pause하고 Now Playing 복귀 후 A로 재개한다.

## 화면 구조

`#lcd-screen` 안에 `#video-view`와 `#menu-view`가 있다. 메뉴는 `data-screen`과 `[data-menu-index]`로 상태를 노출한다. 모든 화면은 `.lcd-header`, `.lcd-content`, `.lcd-footer` 구조를 공유한다. 기능 입력과 상태 문구도 LCD 안에 둔다.

## 구현 작업

- [x] 계획·디자인 기준 갱신
- [x] 순수 navigation reducer와 단위 테스트
- [x] LCD 메뉴 DOM과 렌더러
- [x] 기존 Add/Playlist/AI/Appearance/OpenAI/PiP 연결
- [x] D-pad/A/B/SELECT/START 및 키보드/클릭 연결
- [x] 반응형 스타일과 안정적인 화면 크기
- [x] 타입 검사, 관련 테스트, 빌드
- [x] 확장 action popup 전환과 sidePanel 권한 제거
- [x] 고유·최소 너비 360px, 최대 높이 600px compact popup 스타일
- [x] Home에서 시작하는 380×650px 별도 창 실행
- [x] 이전·다음·한 곡 반복 화면 컨트롤과 종료 동작
- [x] Appearance SAVE 스타일 통일과 하단 장식 곡선 제거
- [x] 로컬 fixture 기반 Chrome 화면 확인 (2026-09-12, 외부 서비스·실제 PiP 제외)

Chrome 확인 스크립트는 로컬 플레이어 브리지, 360/390/480px 레이아웃, 입력 전이, 설정 저장·취소, 메뉴 pause와 A 재개를 검증했다. 2026-09-12 제한 밖 로컬 Chrome 실행에서 Page 초기화와 fixture 계약을 바로잡아 통과했다. 슬라이딩 목록·테마 스크롤바·AI 연결 후 이동·별도 창 크기 확대 결과는 [최신 작업 기록](../results/menu-playlist-search-followup.md)을 따른다.

## 보존 조건

iframe origin 검증, metadata/playback state, playlist 저장과 순서 변경, AI 추천 검증, 설정 저장/취소, 세션 OpenAI 연결, Document PiP 이동·복원을 유지한다. PiP로 이동한 player root의 이벤트는 root 또는 소유 document에 안전하게 연결한다.
