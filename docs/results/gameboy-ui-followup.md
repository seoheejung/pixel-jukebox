# Phase 2–5 후속 작업 — Game Boy UI · AI PICKS

## 학습 목표

진행 중이던 Game Boy UI, 명시적 Design 저장, OpenAI 연결, YouTube 추천곡 연결 변경의 로컬 구현과 검증 마무리.

## 실습

### 1. 기존 변경 유지 및 UI 상태 보완

기존 Shell / Screen / Button 설정, SAVE 버튼, Compact 추천 카드와 YouTube Resolver 구현을 유지했다. `src/sidepanel/index.ts`에서 다음 상태 처리를 보완했다.

- OpenAI 연결 전 AI PICKS 비활성화, 연결 상태 수신 직후 활성 상태 갱신.
- Playlist 추가·삭제 이후 추천 카드의 `+` / `✓` 및 버튼 활성 상태 갱신.
- Service Worker 포트 연결이 끊어지면 추천 로딩 상태 해제.

### 2. 로컬 검증

기존 테스트로 Playlist 저장·순환 이동, 구형 디자인 설정 복구 시 Playlist 보존, Bridge 메시지 검증, Candidate 선택 검증을 확인했다. Resolver 테스트는 검색 도구 출처 제한, 자격 증명 미전달, 메타데이터 불일치·조회 실패 폐기, Selection 1회 재시도와 동일 문맥 Cache Hit를 Mock으로 확인했다.

## 확인 결과

2026-09-08 실행 결과:

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 6 files, 31 tests |
| `npm run build` | PASS |
| `npm run check:bridge` | PASS |
| `npm run check:manifest` | PASS |
| `git diff --check` | PASS |

실제 Chrome 검증은 미실행이다. `npm run test:chrome:bridge`는 GitHub Pages와 YouTube 외부 접속이 필요하며, 이번 작업에는 외부 송신 승인이 없다. 실제 영상 재생, 화면 배치, PiP 및 이번 UI 상태 변경의 브라우저 동작은 미검증이다.

실제 OpenAI 인증·Discovery·Selection·YouTube Resolve도 미검증이다. Cache Context 변경, Playlist Fingerprint 변경, Refresh 우회에 대한 이번 재검증은 수행하지 않았다. `.project/plan.md`의 외부 검증과 전체 완료 기준은 미완료로 유지했다. 과거 Phase 결과의 실행 기록은 당시 결과로 보존했다.
