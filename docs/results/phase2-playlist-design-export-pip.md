# Phase 2 — Playlist · Design · Export · PiP

## 구현 범위

Playlist 저장소와 메시지 경계를 추가하고, 현재 Track 추가·삭제·Drag & Drop 순서 변경·Playlist 기준 Previous/Next·마지막 Track 이후 첫 Track 반복 이동을 구현했다. Design 설정은 `chrome.storage.local`에 저장하며 Text Contrast를 검증한다.

Side Panel에는 Playlist, Design, PNG/GIF Export, Document PiP UI를 연결했다. Export는 외부 Thumbnail을 CORS 방식으로 로드하고 실패 시 Player 시각 요소만 유지한다. Document PiP가 지원되지 않거나 열리지 않으면 Side Panel을 유지한다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 3 files, 30 tests |
| `npm run check:manifest` | PASS |
| `npm run test:chrome:phase2` | PASS — Chrome 152.0.7977.76 |

Chrome 검증에서 다음을 확인했다.

- 여러 Track 추가·중복 추가 차단·Drag & Drop 순서 변경
- Playlist 기준 Next/Previous 순환 이동
- Side Panel reload 후 Playlist와 Design 복구
- 실제 PNG/GIF 생성 완료 상태
- 실제 Document PiP API 실행 및 종료

## 경계 및 잔여 확인 사항

PiP 자동화 검증은 headless Chrome의 합성 click이 user activation을 전달하지 않는 제약이 있어, Side Panel에서 로드된 실제 `documentPictureInPicture.requestWindow()`를 CDP user gesture로 실행하고 종료하는 방식으로 확인했다. 일반 Chrome 사용자의 실제 버튼 클릭 경로는 별도 수동 확인이 필요하다.
