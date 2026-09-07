# Phase 5 — Cache · 안정성 검증

## 구현 범위

Recommendation Service에 `currentTrack.videoId`와 순서를 보존한 playlist fingerprint 조합의 메모리 캐시를 추가했다. 동일 Context는 캐시에서 반환해 OpenAI 요청을 만들지 않으며, `REFRESH PICKS`는 캐시를 우회한다. 새 추천은 최근 추천 목록에 반영되어 다음 Discovery 문맥과 중복 제외에 사용된다.

Selection 실패는 기존 Candidate Set으로만 1회 재시도하고 Discovery를 다시 호출하지 않는다. 재시도까지 실패하면 오류 코드를 UI로 전달하며 Core Player 오류와 분리한다. Partial JSON은 복구하지 않고 폐기한다.

OpenAI 응답 상태는 인증 실패, Rate Limit, 사용량 제한, 기타 요청 실패로 분류한다. AI 권한 또는 설정이 비활성인 경우 Service Worker 요청 경계에서 API 호출을 차단한다. API Key는 메시지·추천 결과·오류 코드에 포함하지 않는다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 5 files, 41 tests |
| `npm run build` | PASS |
| `npm run check:manifest` | PASS |
| `git diff --check` | PASS |

Unit Test에서 동일 Context Cache Hit과 OpenAI 0회, Refresh Cache 우회, Recent Recommendations 전달, Selection Retry 재실행 없음, Partial JSON 폐기, 인증·Rate Limit·사용량 오류 분류, AI 비활성 무호출을 확인했다.

## 외부 환경 확인 필요

실제 OpenAI 계정으로 Discovery Web Search, 실제 비용·Usage, 계정별 Rate Limit 응답은 유효한 API Key가 없어 실행하지 않았다. 캐시는 Service Worker 메모리 수명에 한정되며 브라우저 재시작 후 유지되지 않는다.
