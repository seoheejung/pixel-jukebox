# Phase 2. Playlist · Design · Export · PiP

> AI 없이 사용할 수 있는 Core Player 기능 완성

## 1. 기준 문서

```text
.project/plan.md
→ docs/instructions/phase2-playlist-design-export-pip.md
→ DESIGN.md
→ AGENT.md
```

## 2. 목표

- Playlist 다중 Track 관리
- Playlist 순서 변경 및 반복 재생
- 디자인 설정 저장·복구
- PNG/GIF Export
- Document Picture-in-Picture
- PiP Controller
- Core Player 영속 상태 복구

## 3. 작업 범위

### Playlist

- 현재 Track 추가
- Track 삭제
- Drag & Drop 순서 변경
- Previous / Next
- 마지막 Track 이후 Track 1 반복
- `chrome.storage.local` 저장·복구

### Design

- LP / CD 선택
- Album Artwork
- Background / Panel / Accent / Text Color
- Disc Style
- 설정 저장·복구

### Export

- PNG
- GIF
- 현재 Player 디자인 반영
- 실행 코드는 Extension Package 내부 포함

### PiP

- Feature Detection
- Document PiP 실행
- Disc / Rotation
- Track 정보
- Previous / Play-Pause / Next
- PiP 오류 격리

### 제외

- OpenAI Permission
- API Key
- AI PICKS
- Discovery
- Selection

## 4. 구현 기준

### 4.1 Playlist

Playlist 데이터는 `videoId`를 기준으로 관리한다.

순서 변경 후 저장된 순서와 실제 재생 순서가 일치해야 한다.

### 4.2 반복 재생

```text
Track 1
→ Track 2
→ Track 3
→ Track 1
```

마지막 Track 종료 후 첫 Track으로 이동하는 실제 동작을 확인한다.

### 4.3 Storage

일반 상태만 `chrome.storage.local`에 저장한다.

OpenAI Key 관련 저장 로직은 구현하지 않는다.

### 4.4 Export

Thumbnail이 Canvas Export에 영향을 주는지 실제 이미지 URL 기준으로 검증한다.

검증되지 않은 우회 로직을 미리 추가하지 않는다.

### 4.5 PiP

```ts
'documentPictureInPicture' in window
```

Feature Detection 적용.

PiP 실행은 사용자 동작에서 시작한다.

PiP 실패 시 Side Panel Player는 계속 동작해야 한다.

## 5. 검증

- 여러 Track 추가·삭제
- Drag & Drop 순서 변경
- 반복 재생
- Chrome 재실행 후 Playlist 복구
- Chrome 재실행 후 Design 복구
- PNG 생성
- GIF 생성
- Document PiP 실제 실행
- PiP Controller 동작
- PiP 종료·실패 이후 Side Panel 상태

## 6. 완료 기준

- [ ] 여러 Track Playlist 관리
- [ ] Track 삭제
- [ ] Drag & Drop 순서 변경
- [ ] Previous / Next
- [ ] 마지막 Track 이후 Track 1 이동
- [ ] Playlist 저장·복구
- [ ] Design 저장·복구
- [ ] PNG 생성
- [ ] GIF 생성
- [ ] PiP Feature Detection
- [ ] 사용자 동작 기반 PiP 실행
- [ ] PiP Disc 및 Controller 동작
- [ ] PiP 오류와 Side Panel 오류 격리
- [ ] AI 기능 선반영 없음
