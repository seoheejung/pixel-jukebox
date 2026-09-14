# Pixel Jukebox 디자인 가이드

> Game Boy DMG 감성의 Chrome Extension UI(action popup·별도 창) 기준. 화면 구성은 `.project/plan.md` 10절의 LCD 메뉴 개편을 따른다.

## Visual direction

- Game Boy DMG + 휴대용 음악 플레이어 분위기
- Home 메뉴에서 시작하며, Now Playing 화면에서는 Video Screen과 현재 곡을 중심으로 배치
- D-pad, A/B, SELECT/START의 물리 조작감 유지
- Playlist, AI PICKS, Design, OpenAI Settings는 보조 영역
- Soft UI, Glassmorphism, Blur Shadow, 과도한 3D 효과 금지
- 기술 상태·Cache·Permission 내부 정보 상시 노출 금지

## Core tokens

```css
--color-shell: #D9D7CC;
--color-shell-dark: #C8C4B7;
--color-screen-frame: #5E5E63;
--color-screen: #9BBC0F;
--color-screen-soft: #8BAC0F;
--color-screen-ink: #0F380F;
--color-ink: #2E2230;
--color-dpad: #3B3B3F;
--color-ab: #A13B6D;
--color-ab-dark: #7D2C54;
--color-muted: #7D786F;
--color-danger: #B24848;
--color-focus: #5C6DFF;
```

```css
font-family: "Courier New", "Noto Sans KR", monospace;
border: 2px solid var(--color-ink);
box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.18);
```

Theme 변경 범위: Shell / Screen / Button Tone. 외부 Web Font 금지.

## Layout

```text
┌──────────────────────────────┐
│ PIXEL JUKEBOX          POWER │
│ ┌──────────────────────────┐ │
│ │       VIDEO SCREEN       │ │
│ │ NOW PLAYING              │ │
│ └──────────────────────────┘ │
│                        [A]   │
│    [十]           [B]       │
│       SELECT   START   //// │
└─────────────────────────────╯

LCD 화면 전환: Home / Now Playing / Playlist / AI PICKS / Settings
```

- LCD 안: Home, Player·NOW PLAYING, URL 입력·Playlist, AI PICKS, Settings 화면 전환
- LCD 밖 본체: D-pad, A/B, SELECT/START. 본체 아래 별도 기능 카드나 toolbox를 두지 않음
- Player 16:9 유지
- iframe 위 Overlay·Blur·색상 필터 금지
- 대형 LP 영역 금지
- `channelTitle`을 Artist로 단정하지 않음

## Controls

- D-pad 상하: 메뉴·목록 이동, Now Playing 좌우: Previous / Next
- A: 메뉴 확인·선택, Now Playing에서는 Play / Pause
- B: 뒤로·취소, SELECT: Home, START: Settings
- Hover / Focus / Pressed / Disabled 구분
- 최소 클릭 영역 확보

## Playlist / AI PICKS

Playlist:
- Compact Row
- Track Title + Channel
- Current / Dragging / Drop Target / 삭제 / 순서 변경 지원

AI PICKS:
- Thumbnail + Track Title + Playlist 추가 Action
- Candidate ID, Cache, Web Search, 내부 처리 단계, 긴 Reason/Tag 노출 금지
- 검증 없는 Playlist 자동 삽입 금지

Card Flip (현재 미사용, 재도입 시 기준):
- 별도 상세 버튼에서만 실행
- 뒷면은 검증된 곡명·채널 등 짧은 정보만 표시
- 추가 AI 조회 금지
- Reduced Motion에서는 회전 없이 상태 전환

## Settings / PiP

OpenAI Settings:
- API Key + `CONNECT` 단일 흐름
- Key 원문 재표시 금지
- 성공은 작은 `Connected`, 실패는 한 줄 Error
- 기본 Session 저장, 영속 저장은 보조 옵션

Design Settings:
- Shell / Screen / Button Tone
- `SAVE` 시에만 영속 저장
- 복잡한 Theme Editor 금지

PiP:
- 실제 영상 + Track Title + Channel + Previous / Play-Pause / Next
- Playlist 편집, AI PICKS, Settings 제외
- 닫으면 Player 원위치 복원
- 기존 디자인 설정값과 Reduced Motion 상태 유지

## Motion / material

허용:
- Button Press
- Playlist Drag Lift
- NOW PLAYING 옆 작은 Disc 관성 회전
- 약한 금속 하이라이트와 화면 외곽 유리 반사
- AI 카드 Hover의 낮은 강도 Hologram

금지:
- 대형 Disc
- 상시 장식 애니메이션
- 넓은 크롬 반사
- 전체 Glass UI
- Player보다 눈에 띄는 3D 효과

Motion은 `transform` / `opacity` 중심. 외부 애니메이션 라이브러리 추가 금지.

## Responsive / accessibility

- Compact: 320–379px
- Default: 380–479px
- Wide: 480px+
- 320 / 390 / 480px에서 Playlist·AI Card Overflow 금지
- Focus Ring, Accessible Name, 키보드 조작, Reduced Motion 지원
- 색상만으로 상태 구분 금지
- Drag & Drop 외 순서 변경 대안 제공

사용자 표시 가능 상태:
`Loading`, `Connected`, `Error`, `Empty`, `Playing`, `Paused`

직접 노출 금지:
`SESSION_ONLY`, `CACHE_HIT`, `DISCOVERY`, `SELECTION`, `REQUESTING_PERMISSION`, `CONFIGURED`

## Done

- Game Boy 본체와 Home 시작 구조
- Now Playing에서 Video Screen 중심 구조
- NOW PLAYING과 물리 조작부 배치
- Playlist / AI PICKS Compact UI
- OpenAI 단일 Connect 흐름
- Design `SAVE` 저장
- Press / Drag / Disc Motion 및 Reduced Motion 대응
- 320 / 390 / 480px Overflow 없음
- 실제 Chrome action popup·별도 창 시각 검증
