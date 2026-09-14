# Pixel Jukebox Design Specification

> Game Boy DMG 콘셉트의 Chrome Extension UI (Action Popup 및 Standalone Window) 디자인 시스템 명세.

## 1. Visual Direction & Style Tokens

Game Boy DMG의 물리 조작감과 휴대용 음악 플레이어의 감성을 결합한다. Soft UI, Glassmorphism, 과도한 3D 효과는 사용하지 않는다.

### Core CSS Tokens
```css
/* Color Palette */
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

/* Base Typography & Borders */
font-family: "Courier New", "Noto Sans KR", monospace;
border: 2px solid var(--color-ink);
box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.18);

### Style Constraints

- **테마 변경 허용 범위**: Shell / Screen / Button Tone에 국한 (외부 웹폰트 추가 금지).
- **외부 애니메이션 의존성 금지**: CSS `transform` 및 `opacity`만 사용.
- **모션 허용**: 버튼 눌림(Press), 플레이리스트 드래그(Lift), Now Playing 소형 디스크 관성 회전, 카드 hover 홀로그램 효과.
- **모션 금지**: 대형 디스크, 상시 반복 장식 애니메이션, 대형 크롬/유리 반사. `prefers-reduced-motion` 환경에서는 모든 회전/이동을 즉각적인 상태 전환으로 대체.

## 2. Layout & Shell Architecture

Plaintext

```
┌──────────────────────────────┐
│ PIXEL JUKEBOX          POWER │
│ ┌──────────────────────────┐ │
│ │       VIDEO SCREEN       │ │
│ │ NOW PLAYING              │ │
│ └──────────────────────────┘ │
│                         [A]  │
│    [十]             [B]      │
│       SELECT   START   ////  │
└──────────────────────────────┘
```

- **LCD 내부**: 5개 화면(`Home`, `Now Playing`, `Playlist`, `AI PICKS`, `Settings`) 간 전환.
- **LCD 외부 본체**: 물리 컨트롤러(D-pad, A/B, SELECT/START) 배치. 본체 하단에 별도 카드나 툴박스를 추가하지 않는다.
- **Player 비디오**: 16:9 비율 고정. iframe 위 오버레이, 블러, 색상 필터 금지.

## 3. Physical Controller Mapping

| **컨트롤** | **기본 모드 (Home/Menu/List)** | **Now Playing 모드** |
| --- | --- | --- |
| **D-pad 상/하** | 메뉴 및 목록 아이템 이동 | - |
| **D-pad 좌/우** | - | Previous Track / Next Track |
| **A 버튼** | 항목 확인 및 선택 | Play / Pause |
| **B 버튼** | 뒤로 가기 / 취소 | 뒤로 가기 (Home 복귀) |
| **SELECT** | Home 화면으로 즉시 이동 | Home 화면으로 즉시 이동 |
| **START** | Settings 화면으로 즉시 이동 | Settings 화면으로 즉시 이동 |

*공통: 버튼은 Hover, Focus, Pressed, Disabled 상태를 명확히 구분하고, 충분한 터치/클릭 타깃 영역을 확보한다.*

## 4. View Specifications

### Playlist & AI PICKS

- **Playlist**: Compact Row 형태. 곡명(`Track Title`) + 채널(`channelTitle`) 표시. 삭제, 순서 변경(DnD 및 키보드 대체 수단 제공) 지원.
- **AI PICKS**: 썸네일 + 곡명 + 플레이리스트 추가 액션 제공.
    - 내부 파라미터(Candidate ID, Cache, Search 단계, 긴 이유/태그 등) 노출 금지.
    - 사용자 승인 없는 플레이리스트 자동 삽입 금지.
- **채널명 취급**: `channelTitle`은 채널명 그대로 표기하며, 임의로 '아티스트'로 단정하여 가공하지 않는다.

### Settings & PiP

- **OpenAI Settings**: API Key 입력 + `CONNECT` 단일 액션.
    - 저장된 Key 원문은 마스킹 없이 재표시하지 않는다.
    - 기본 저장소는 Session Storage이며, Local Storage(영속 저장)는 보조 옵션으로 둔다.
- **Design Settings**: Shell / Screen / Button Tone 색상 선택. `SAVE` 버튼 클릭 시에만 저장 반영.
- **PiP (Picture-in-Picture)**: 영상 + 곡명 + 채널 + 재생 제어(Prev/Play/Next)만 포함. 플레이리스트 편집 및 설정 진입은 제외. 창 복원 시 기존 디자인 및 모션 설정 유지.

## 5. UI State Exposure Invariants

사용자 인터페이스에 노출 가능한 상태와 은닉해야 하는 내부 런타임 상태를 엄격히 구분한다.

- **노출 허용 상태**: `Loading`, `Connected`, `Error`, `Empty`, `Playing`, `Paused`
- **노출 금지 (내부 상태)**: `SESSION_ONLY`, `CACHE_HIT`, `DISCOVERY`, `SELECTION`, `REQUESTING_PERMISSION`, `CONFIGURED`

## 6. Verification Checklist

UI 작업 완료 시 아래 3개 반응형 기준점에서 오버플로 및 깨짐이 없어야 한다.

- **Compact (320px ~ 379px)**: 320px에서 가로 스크롤 및 컴포넌트 겹침 없음.
- **Default (380px ~ 479px)**: 390px 표준 크기 정상 렌더링.
- **Wide (480px+)**: 480px 확장 상태 정상 렌더링.
- 키보드 접근성(Focus Ring)과 `prefers-reduced-motion` 모드 동작 확인.