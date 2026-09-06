# Pixel Jukebox 디자인 가이드

> 픽셀 게임 UI의 선명한 경계와 오래된 음악 플레이어의 감성을 결합한 Chrome Side Panel 디자인 기준

---

## 1. 디자인 목표

Pixel Jukebox의 화면은 `레트로 게임 UI + 작은 데스크톱 음악 기기`에 가깝게 구성한다.

핵심은 픽셀 느낌을 장식으로 과하게 덧붙이는 것이 아니라, Border, Shadow, Icon, Typography, 간격 규칙을 일관되게 사용하는 것이다.

### 키워드

```text
PIXEL
JUKEBOX
RETRO PC
VINYL / CD
SOFT CREAM
VIOLET
ORANGE
GREEN
HARD EDGE
```

### 우선순위

1. 현재 재생 상태 인지
2. Disc 시각화
3. Playlist 조작
4. AI PICKS 탐색
5. Design / Export / 설정

AI PICKS는 기능적으로 중요하지만 Player보다 시각적으로 앞서지 않는다.

---

# 2. 디자인 원칙

## 선명한 Pixel Edge

- Blur Shadow 사용 금지
- Glassmorphism 사용 금지
- 반투명 Layer 최소화
- Border Radius 최소화
- 1px보다 2px Border 우선
- Shadow는 X/Y Offset 기반 Hard Shadow 사용

```css
.pixel-panel {
  border: 2px solid var(--color-ink);
  box-shadow: 4px 4px 0 var(--color-ink);
}
```

## 4px Grid

모든 주요 간격은 4px 단위로 구성한다.

```text
4
8
12
16
20
24
32
40
```

임의의 `13px`, `19px`, `27px` 간격을 반복해서 사용하지 않는다.

## 제한된 Palette

한 화면에서 지나치게 많은 색상을 사용하지 않는다.

기본 구조:

```text
Cream
Ink
Violet
Orange
Green
White
```

## 기능 우선

Pixel 장식 때문에 버튼, 상태, 텍스트 가독성이 떨어지면 장식을 제거한다.

---

# 3. Color System

## 기본 Palette

| Token | 값 | 용도 |
|---|---|---|
| `--color-bg` | `#FFF4D8` | 전체 배경 |
| `--color-surface` | `#FFF9EA` | 카드 / Panel |
| `--color-ink` | `#28172F` | Border / 본문 |
| `--color-violet` | `#7437FF` | 주요 강조 / AI PICKS |
| `--color-orange` | `#FF6A3D` | 재생 / 활성 액션 |
| `--color-green` | `#34C878` | 연결 / 정상 상태 |
| `--color-yellow` | `#FFD75A` | Tag / 보조 강조 |
| `--color-danger` | `#D94B4B` | 오류 |
| `--color-white` | `#FFFFFF` | 고대비 텍스트 / Surface |
| `--color-muted` | `#786D7D` | 보조 설명 |

### CSS Token

```css
:root {
  --color-bg: #fff4d8;
  --color-surface: #fff9ea;
  --color-ink: #28172f;
  --color-violet: #7437ff;
  --color-orange: #ff6a3d;
  --color-green: #34c878;
  --color-yellow: #ffd75a;
  --color-danger: #d94b4b;
  --color-white: #ffffff;
  --color-muted: #786d7d;
}
```

사용자 색상 변경 기능이 적용되더라도 상태 색상까지 임의 변경하지 않는다.

사용자 Custom Color 적용 대상:

- 배경
- Disc Accent
- Panel Accent
- 선택 강조

고정 유지 대상:

- Error
- Success
- Disabled
- Text Contrast 기준

---

# 4. Typography

외부 Web Font에 의존하지 않는다.

기본 Font Stack:

```css
font-family:
  "Courier New",
  "Noto Sans KR",
  monospace;
```

Pixel Font를 도입할 경우 Extension Package 내부 Asset으로 포함한다.

## Scale

| 용도 | 크기 | Weight |
|---|---:|---:|
| App Title | 20px | 700 |
| Section Title | 14px | 700 |
| Track Title | 14px | 700 |
| Body | 12px | 400 |
| Meta | 11px | 400 |
| Tag | 10px | 700 |
| Button | 11px | 700 |

## 텍스트 스타일

```text
OUR FAVORITE SONGS
NOW PLAYING
AI PICKS
REFRESH PICKS
```

영문 대문자 Label은 Pixel UI의 구조적 Label에만 사용한다.

긴 설명문까지 모두 대문자로 작성하지 않는다.

---

# 5. Border / Shadow

## Border

기본:

```css
border: 2px solid var(--color-ink);
```

약한 구분:

```css
border: 1px solid var(--color-ink);
```

## Hard Shadow

기본 Card:

```css
box-shadow: 4px 4px 0 var(--color-ink);
```

작은 Button:

```css
box-shadow: 2px 2px 0 var(--color-ink);
```

Pressed:

```css
transform: translate(2px, 2px);
box-shadow: none;
```

Blur Shadow는 사용하지 않는다.

---

# 6. Side Panel Layout

Side Panel은 폭이 변할 수 있으므로 고정 Desktop Page처럼 설계하지 않는다.

기본 구조:

```text
┌──────────────────────────────┐
│ PIXEL JUKEBOX                │
│ YOUTUBE PLAYER               │
├──────────────────────────────┤
│                              │
│             ◉                │
│          DISC AREA           │
│                              │
│ NOW PLAYING                  │
│ Track Title                  │
│ Channel / Artist             │
│                              │
│ [◀]       [▶]       [▶▶]    │
├──────────────────────────────┤
│ PLAYLIST                     │
│ 01 Track                     │
│ 02 Track                     │
│ 03 Track                     │
├──────────────────────────────┤
│ AI PICKS                     │
│ Track A                  [+] │
│ Track B                  [+] │
│                              │
│ [ REFRESH PICKS ]            │
└──────────────────────────────┘
```

## 기본 Padding

```text
Panel Outer Padding: 16px
Section Gap: 24px
Card Padding: 12px
Control Gap: 8px
```

## 폭 대응

### 좁은 폭

- Disc 크기 축소
- Playlist Metadata 1줄 생략 가능
- AI Reason 최대 2줄
- Button Label 축약 가능

### 넓은 폭

- Disc 최대 크기 제한
- Content를 무조건 양쪽으로 늘리지 않음
- 읽기 폭 유지

---

# 7. Header

```text
PIXEL JUKEBOX
YOUTUBE MUSIC PLAYER
```

## 구성

왼쪽:

- Project Name
- 현재 연결된 YouTube Tab 상태

오른쪽:

- Settings
- Export

Icon은 Pixel Style로 통일한다.

실선 Vector Icon을 사용하더라도 16x16 Grid 안에서 Pixel Snap된 형태로 제작한다.

---

# 8. Disc Area

Disc는 화면의 시각적 중심이다.

## LP

구조:

```text
Outer Disc
Groove Ring
Center Label
Center Hole
Artwork
```

추천 Size 범위:

```text
160px ~ 220px
```

Side Panel 폭에 따라 축소한다.

## CD

- Silver 계열 기반
- Pixel Highlight
- 중심 Hole
- Artwork 선택 표시

## Rotation

재생 중:

```css
animation: spin linear infinite;
```

일시정지:

```css
animation-play-state: paused;
```

Animation 속도는 눈에 피로하지 않은 수준으로 Phase 1 실측 후 고정한다.

## Pixel 표현

- Disc Edge는 선명하게 유지
- 과도한 Blur Reflection 금지
- Highlight는 1~2개의 Hard Shape 사용
- Groove는 전체를 세밀하게 그리기보다 반복 Ring으로 표현

---

# 9. Now Playing

```text
NOW PLAYING
Track Title
Channel / Artist
```

## Track Title

- 최대 2줄
- 넘침 Ellipsis 허용
- 현재 재생 여부가 가장 잘 보이는 영역

## Channel / Artist

- 보조 정보
- `channelTitle`을 Artist라고 단정하지 않음

## Thumbnail

Disc Artwork에 사용 가능.

Thumbnail 로딩 실패 시 기본 Pixel Disc Artwork 표시.

---

# 10. Playback Controller

기본 Control:

```text
[◀] [▶ / ❚❚] [▶▶]
```

Button 형태:

```text
2px Border
Hard Shadow
48px 수준 Touch Target 우선
```

Pixel 디자인이어도 클릭 영역은 작게 만들지 않는다.

## 상태

### Default

Cream Surface + Ink Border

### Hover

Violet 또는 Orange Accent

### Active

2px 이동 + Shadow 제거

### Disabled

낮은 Contrast + Cursor 상태 변경

---

# 11. Playlist

## Row

```text
┌────────────────────────────┐
│ 01  Track Title        ⋮   │
│     Channel                │
└────────────────────────────┘
```

현재 Track:

```text
▶ 02 Track Title
```

## 상태

- Default
- Hover
- Current
- Dragging
- Drop Target

## Drag & Drop

Dragging 상태:

- 2px Dashed Border
- Hard Shadow 제거
- 약한 Surface 변화

Drop Target:

- Violet 2px Guide Line

순서 변경이 색상만으로 표현되지 않도록 Position Indicator를 함께 표시한다.

---

# 12. AI PICKS

AI 영역은 Pixel Player의 보조 기능으로 표현한다.

## 미연결 상태

```text
┌────────────────────────────┐
│ AI PICKS                   │
│                            │
│ OpenAI 연결 후             │
│ 비슷한 음악을 찾을 수 있어요 │
│                            │
│ [ OPENAI 연결 ]            │
└────────────────────────────┘
```

AI Card 전체를 Violet로 채우지 않는다.

Violet은 Border, Label, Tag 수준에서 사용한다.

## 추천 결과

```text
01
Track Title
Artist

[DREAMY] [INDIE]
현재 곡의 기타 질감과 유사

[ YOUTUBE에서 찾기 ]
```

### Reason

- 최대 2줄
- 한국어
- 과장된 AI 설명 금지

### Tags

- 1~3개
- 작은 Pixel Chip

```css
.tag {
  border: 1px solid var(--color-ink);
  padding: 2px 6px;
  box-shadow: 1px 1px 0 var(--color-ink);
}
```

---

# 13. AI 상태 디자인

## Configured

```text
OPENAI
■ CONFIGURED
```

## Loading

Pixel Ellipsis Animation 사용 가능.

```text
AI PICKS SEARCHING . . .
```

Spinner 대신 3 Frame Dot Animation 우선.

## Cache Hit

사용자에게 굳이 기술 용어를 노출하지 않는다.

```text
SAVED PICKS
```

정도로만 표현 가능.

## Error

```text
AI PICKS ERROR
결과를 처리하지 못했습니다.

[ 다시 추천 ]
```

Error Card는 Red Border + Cream Surface 유지.

전체 화면을 Red로 바꾸지 않는다.

---

# 14. OpenAI 설정 화면

```text
OPENAI SETTINGS

API KEY
[ •••••••••••••••••••• ]

[ ] 이 브라우저에 API Key 저장

! 브라우저 저장소는 서버 Secret과
  동일한 보안을 제공하지 않습니다.

[ SAVE ]
```

## 기준

- Key 원문 재표시 금지
- 저장 완료 후 `CONFIGURED` 상태 표시
- Local 저장 선택 시 Security Warning 표시
- Permission 거부 상태 별도 표현
- AI 기능을 끄면 기본 Player와 Playlist는 그대로 유지

---

# 15. Design Settings

```text
DESIGN

DISC
[ LP ] [ CD ]

BACKGROUND
[ ■ ]

ACCENT
[ ■ ]

TEXT
[ ■ ]

[ RESET ]
```

Color Picker를 Pixel UI 안에 억지로 재구현하지 않는다.

Browser Native Color Input 사용 가능.

```html
<input type="color" />
```

Pixel Style Wrapper로 외형만 통일한다.

---

# 16. Export UI

```text
EXPORT

[ PNG ]
[ GIF ]
```

저장 중:

```text
RENDERING . . .
```

완료:

```text
EXPORT COMPLETE
```

Export 결과물은 Side Panel 전체 Screenshot이 아니라 Player Visual을 중심으로 구성한다.

정확한 출력 크기와 GIF Duration은 Phase 2 실측 후 고정한다.

---

# 17. Document PiP 디자인

PiP는 Side Panel의 축약 버전이다.

```text
┌──────────────────────────┐
│ PIXEL JUKEBOX            │
│                          │
│           ◉              │
│                          │
│ Track Title              │
│ Channel / Artist         │
│                          │
│ [◀]   [▶]   [▶▶]        │
└──────────────────────────┘
```

## 포함

- Disc
- Track Title
- Channel / Artist
- Previous
- Play / Pause
- Next

## 제외

- Playlist 편집
- AI PICKS 전체 목록
- OpenAI 설정
- Export
- Design 설정

## 크기 변화

PiP Window가 작아질 경우:

1. Channel 정보 축약
2. Disc 축소
3. App Subtitle 제거

Controller는 유지한다.

---

# 18. Pixel Icon 기준

기본 Grid:

```text
16 x 16
20 x 20
24 x 24
```

Icon 종류:

- Play
- Pause
- Previous
- Next
- Add
- Delete
- Drag
- Settings
- Export
- AI
- Refresh
- PiP

## 규칙

- 1px Half Pixel Position 금지
- 동일 Stroke Weight 유지
- Filled / Outline 혼용 최소화
- Emoji를 기능 Icon으로 사용하지 않는다.
- Unicode Symbol은 Prototype에서만 허용

---

# 19. Animation

허용:

- Disc Rotation
- Button Press
- Pixel Loading Dots
- Track 변경 시 짧은 Slide/Fade
- Drag & Drop Guide

금지:

- Background Particle
- 지속적인 Glow
- 큰 Parallax
- AI Card Pulse
- 과도한 Bounce

Animation은 기능 상태 전달을 우선한다.

---

# 20. 상태 정의

모든 주요 기능은 상태를 문서화해서 구현한다.

## Player

```text
NO_TAB
NO_VIDEO
READY
PLAYING
PAUSED
ERROR
```

## Playlist

```text
EMPTY
READY
DRAGGING
```

## AI

```text
DISABLED
NOT_CONFIGURED
CONFIGURED
REQUESTING_PERMISSION
DISCOVERY
SELECTION
READY
ERROR
```

## PiP

```text
UNSUPPORTED
READY
OPEN
ERROR
```

상태 문자열은 UI Label과 내부 Enum을 반드시 동일하게 만들 필요는 없다.

---

# 21. Empty State

## Playlist Empty

```text
PLAYLIST EMPTY

YouTube에서 듣고 있는 곡을
Playlist에 추가해보세요.
```

## AI PICKS Empty

```text
NO PICKS YET

AI PICKS를 실행하면
현재 음악과 비슷한 곡을 찾습니다.
```

## YouTube 미연결

```text
NO YOUTUBE TRACK

YouTube에서 음악을 재생해주세요.
```

---

# 22. Error State

Error는 기능 단위 Card 내부에 표시한다.

```text
┌────────────────────────────┐
│ AI PICKS ERROR             │
│                            │
│ 추천 결과를 처리하지       │
│ 못했습니다.                │
│                            │
│ [ 다시 추천 ]              │
└────────────────────────────┘
```

한 기능의 오류가 다른 Section 전체를 Error 화면으로 덮지 않는다.

---

# 23. Accessibility

Pixel Style을 이유로 접근성을 낮추지 않는다.

- 주요 Text Contrast 확보
- Focus Ring 제거 금지
- Keyboard Focus 상태 별도 디자인
- 버튼 Icon에는 Accessible Name 제공
- Drag & Drop 외 순서 변경 대안 검토
- 색상만으로 재생/오류/연결 상태 표시 금지
- Motion 감소 환경 대응 검토

Focus:

```css
:focus-visible {
  outline: 2px solid var(--color-violet);
  outline-offset: 2px;
}
```

---

# 24. Responsive 기준

Side Panel은 가변 폭을 전제로 한다.

## Compact

```text
320px ~ 379px
```

- Disc 축소
- Track Metadata 최소화
- Button 3열 유지
- AI Reason 2줄 제한

## Default

```text
380px ~ 479px
```

기본 디자인 기준.

## Wide

```text
480px 이상
```

- Content 최대 폭 유지
- Disc 무한 확대 금지
- Card Padding만 제한적으로 증가

실제 Side Panel 최소/최대 폭 정책은 Phase 0~1에서 현재 Chrome 동작을 확인하고 조정한다.

---

# 25. 디자인 Token

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  --border-thin: 1px;
  --border-default: 2px;

  --shadow-sm: 2px 2px 0 var(--color-ink);
  --shadow-md: 4px 4px 0 var(--color-ink);

  --radius-none: 0;
  --radius-sm: 2px;
  --radius-md: 4px;
}
```

과도한 Rounded UI를 피한다.

Pixel 감성을 유지하면서 손으로 만든 Sticker 느낌이 필요한 일부 Chip만 4px Radius를 허용한다.

---

# 26. 주요 컴포넌트

```text
AppShell
Header
PixelPanel
DiscPlayer
NowPlaying
PlaybackControls
Playlist
PlaylistItem
PixelButton
PixelIconButton
PixelTag
EmptyState
ErrorState
SettingsPanel
ExportPanel
OpenAISettings
AiPicks
AiPickItem
PixelLoader
PipPlayer
```

현재 Phase에 필요한 컴포넌트만 구현한다.

이 목록을 이유로 이후 Phase 파일을 선생성하지 않는다.

---

# 27. Screen 구성

## Main

```text
Header
DiscPlayer
NowPlaying
PlaybackControls
Playlist
AI PICKS
```

## Settings

```text
Header
Design Settings
Playback Preferences
OpenAI Settings
```

## Export

```text
Preview
PNG
GIF
```

## PiP

```text
Disc
Track
Controller
```

화면 전환을 복잡한 Router로 구성하지 않는다.

Side Panel 내부 Section 전환 수준으로 유지한다.

---

# 28. Design Phase 기준

## Phase 0

- App Shell
- Header
- Side Panel 기본 Layout
- Placeholder 상태

AI UI 구현 금지.

## Phase 1

- Disc
- Now Playing
- Playback Controller
- YouTube 연결 상태

Playlist UI 선반영 금지.

## Phase 2

- Playlist
- Design Settings
- Export
- PiP

AI UI 선반영 금지.

## Phase 3

- AI PICKS 비활성/설정 상태
- OpenAI Settings
- Permission 상태
- API Key Warning

Recommendation Card 구현 금지.

## Phase 4

- AI PICKS Recommendation List
- Loading
- Empty
- Error
- Tags
- YouTube Search Action

## Phase 5

- Cache 관련 상태
- Retry 결과 상태
- 안정성 검증에 따른 UI 보정

---

# 29. 디자인 검증 체크리스트

- [ ] Pixel Border 일관성
- [ ] 4px Grid 유지
- [ ] Blur Shadow 없음
- [ ] 주요 버튼 충분한 클릭 영역
- [ ] 현재 Track 식별 가능
- [ ] Playlist 현재 위치 식별 가능
- [ ] AI 영역이 Player보다 시각적으로 강하지 않음
- [ ] Loading / Empty / Error 상태 존재
- [ ] Keyboard Focus 표시
- [ ] Side Panel Compact 폭 대응
- [ ] PiP 작은 창 대응
- [ ] OpenAI Key 원문 UI 재표시 없음
- [ ] 외부 Web Font 의존 없음
- [ ] Remote Hosted Code 없음
- [ ] 사용자 Custom Color 적용 후 Text Contrast 확인

---

# 30. 완료 기준

디자인 구현은 아래 조건을 만족해야 완료로 판정한다.

- Pixel Style Token 적용
- Player 중심 시각 위계 유지
- Playlist 조작 상태 명확
- AI Opt-in 상태 명확
- Error가 기능 단위로 격리
- Side Panel 폭 변화 대응
- PiP Layout 정상 동작
- Keyboard Focus 확인
- 실제 Chrome 환경에서 시각 검증
- 현재 Phase 밖 UI 선반영 없음
