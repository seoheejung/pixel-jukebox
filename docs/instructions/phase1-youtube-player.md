# Phase 1. YouTube Player

> YouTube 현재 재생 상태를 감지하고 Side Panel의 최소 LP/CD Player와 연결

## 1. 기준 문서

```text
.project/plan.md
→ docs/instructions/phase1-youtube-player.md
→ DESIGN.md
→ AGENT.md
```

## 2. 목표

- 현재 YouTube 영상 식별
- Video ID, Title, Channel, Thumbnail 수집
- Play/Pause 상태 감지
- YouTube SPA 전환 감지
- Side Panel Track 상태 갱신
- LP/CD Disc 및 Rotation 구현
- 기본 Playback Controller 연결
- 여러 YouTube Tab 상태 분리

## 3. 작업 범위

### 포함

- `videoId`
- `videoTitle`
- `channelTitle`
- `thumbnail`
- `videoUrl`
- `playbackState`
- `tabId` 기반 상태 분리
- LP/CD Disc
- 재생 중 Rotation
- Pause 시 Rotation 정지
- Previous / Play-Pause / Next 최소 Controller 연결
- YouTube SPA 전환 대응

### 제외

- Playlist 추가·삭제·순서 변경
- Playlist 영속 저장
- Design 설정
- PNG/GIF
- Document PiP
- OpenAI
- AI PICKS

## 4. 구현 기준

### 4.1 Track 식별

재생 식별자는 `videoId`를 기준으로 한다.

`channelTitle`을 Artist라고 단정하지 않는다.

### 4.2 SPA 전환

기획 단계에서 특정 DOM Selector를 고정하지 않는다.

실제 YouTube 구조를 확인하고 최소 의존 방식으로 구현한다.

검증 대상:

```text
최초 영상 진입
영상 클릭 이동
Browser Back / Forward
Playlist 이동
자동 재생
```

### 4.3 여러 Tab

각 YouTube Tab 상태를 `tabId`로 분리한다.

한 Tab의 Track 변경이 다른 Tab의 상태를 덮어쓰지 않아야 한다.

### 4.4 UI

`DESIGN.md`의 Phase 1 범위만 구현한다.

AI 영역, Playlist 편집 UI, Export UI는 구현하지 않는다.

## 5. 검증

- 최초 YouTube 영상 감지
- SPA 영상 변경 감지
- Track 메타데이터 갱신
- Play/Pause 상태 동기화
- Disc Rotation 동기화
- Controller 동작
- 2개 이상 YouTube Tab 동시 실행 시 상태 혼선 여부

## 6. 완료 기준

- [ ] 최초 영상 감지
- [ ] Video ID / Title / Channel / Thumbnail 수집
- [ ] SPA 전환 감지
- [ ] Side Panel Track 갱신
- [ ] Play/Pause 상태 갱신
- [ ] 재생 중 Disc Rotation
- [ ] Pause 시 Rotation 정지
- [ ] 기본 Controller 동작
- [ ] 여러 YouTube Tab 상태 혼선 없음
- [ ] Phase 2 이후 기능 선반영 없음
