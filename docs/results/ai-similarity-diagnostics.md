# Phase 3–5 후속 작업 — 현재 곡 유사도 추천과 실패 진단

## 작업 범위

현재 듣는 곡과 비슷한 음악을 추천하도록 검색·선택 기준을 보완하고, 실제 요청 실패 시 사용자가 원인과 조치를 확인할 수 있는 진단 경로 구현.

## 구현 내용

### 1. 현재 곡 중심 추천

`src/background/recommendation.ts`의 Discovery는 현재 곡을 먼저 식별하고 검색으로 음악적 맥락을 확인한다. 원곡 발매 시기, 장르·서브장르, 분위기·에너지·템포, 악기·보컬·프로덕션의 유사성을 사용한다. YouTube 업로드일과 발매일을 구분하며, 인접 시대는 선호 기준으로만 사용한다. 확인하지 못한 사실 생성, 동일 곡의 다른 버전·커버·리믹스·기존 목록 중복을 피하고 아티스트 다양성을 고려한다.

Selection에도 현재 곡·Playlist·최근 추천을 전달한다. 같은 기준으로 순위를 정하되 기존 후보 ID만 최대 5개 선택하는 Strict Schema와 동일 요청 1회 재시도를 유지한다. Discovery는 Web Search 실행을 필수로 지정한다.

### 2. 단계별 실패 진단

`src/background/ai.ts`, `src/background/connections.ts`, `src/shared/ai.ts`, `src/sidepanel/index.ts`에서 연결 확인·후보 검색·후보 선택·YouTube 검색·영상 확인 단계를 전달한다. HTTP 상태, API 오류 코드·유형·대상 파라미터, 요청 ID, 정제한 메시지가 실패 시 UI에 표시된다.

권한·키 미설정, 잘못된 요청, 리소스 없음, 요청 빈도 제한, 결제·사용량 부족, 서버 오류, 네트워크·시간 초과, JSON 오류를 구분한다. HTTP 200 안의 `failed`/`incomplete`도 상세 사유를 전달한다. API의 오류 분류는 [공식 오류 문서](https://developers.openai.com/api/docs/guides/error-codes)를 참고했다.

정제는 실제 키 문자열 및 Bearer·`sk-*` 패턴 제거 후 길이를 제한한다. 원본 응답과 인증 헤더는 전달하지 않고, UI는 `textContent`로 출력한다. 연결 확인 15초, 개별 Responses API 요청 120초 제한을 적용한다. 전체 추천 작업의 총 제한 시간은 아니다.

YouTube 검색 출처 없음, 영상 메타데이터 전체 조회 실패, 일치하는 후보 없음을 구분한다. CONNECT 오류도 같은 진단 경로를 사용한다.

## 확인 결과

2026-09-08 AI 수정 완료 시점의 로컬 검증:

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 6 files, 38 tests |
| `npm run build` | PASS |
| `npm run check:bridge` | PASS |
| `npm run check:manifest` | PASS |
| 변경 파일 `git diff --check` | PASS |

Mock 검증에서 HTTP 오류의 단계·필드 전달과 민감정보 제거, 429 사용량 구분, HTTP 200 실패·미완료 진단, 권한 없음, 현재 곡 문맥 및 동일 Selection 재시도를 확인했다.

실제 OpenAI·YouTube 호출과 추천 품질은 미검증이다. 기존 `OPENAI REQUEST FAILED` 당시 HTTP 응답이 보존되지 않아 과거 실패 원인은 확정하지 않았다. 수정본의 다음 실행부터 상세 오류를 확인할 수 있다.

### 2026-09-11 후속 검증

Discovery는 Web Search로 근거 텍스트를 수집한 뒤 별도 Structured Output 요청으로 후보를 추출한다. 검색 근거에 없는 곡은 생성하지 않고 Candidate Parser와 Selection의 ID 검증을 거친다. Selection 실패 시 동일 후보로 한 번 재시도하는 동작과 빈 Discovery의 재검색은 구분한다.

후보가 비면 최근 추천 제외를 완화해 Discovery를 한 번 다시 실행한다. 첫 YouTube 검색에서 일부 후보를 확인한 뒤 개별 보충 검색이 실패해도 확인된 추천은 유지한다. 현재 곡·Playlist·정규화된 Artist/Title 중복 제외, 빈 후보의 2회 탐색, 보충 검색 실패의 부분 결과, 같은 Panel의 동시 중복 요청 차단을 mock으로 검증했다.

AI Picks는 검색 기준 곡, Discovery/Selection/YouTube/Metadata 진행 단계, 오류 후 Retry, 절제된 pixel loader를 표시한다. `prefers-reduced-motion: reduce`에서는 loader animation을 중단한다. Chrome fixture smoke test에 이 상태 전이 검증을 추가했다.

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 7 files, 48 tests |
| `npm run build` | PASS |
| `npm run check:bridge` | PASS |
| `npm run check:manifest` | PASS |
| `npm run test:chrome:ui` | FAIL — Chrome DevTools WebSocket 연결 중 `ErrorEvent`; UI assertion 실행 전 종료 |

OpenAI·YouTube 실제 호출은 수행하지 않았으며 추천 품질은 미검증이다. Chrome UI의 seed/progress/retry/reduced-motion assertion은 fixture에 포함됐지만, 현재 환경의 DevTools WebSocket 연결 실패로 실제 브라우저 통과 여부는 미검증이다.
