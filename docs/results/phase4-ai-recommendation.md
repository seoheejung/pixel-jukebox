# Phase 4 — AI Recommendation

## 구현 범위

Discovery와 Selection을 별도 Service Worker 요청으로 분리했다. Discovery는 `web_search` 도구와 고정 `CANDIDATE|ID|Artist|Track` line format을 사용하고, Selection은 Web Search 없이 Responses API Structured Outputs JSON Schema를 사용한다.

Candidate Parser는 중복·현재 문맥 중복·잘못된 line을 제거한다. Selection 결과는 Candidate ID whitelist, 중복 ID, 최대 5개, 한국어 Reason, 1~3개 Tag를 검증한 뒤 Candidate 원본 Artist/Track과 결합한다. 검증 실패 시 동일 Candidate Set으로 Selection만 1회 재시도하며 Discovery를 재실행하지 않는다. Partial JSON은 폐기한다.

YouTube 연결은 모델이 생성한 Video ID/URL을 사용하지 않고 원본 Artist + Track으로 검색 URL을 만든다. Recommendation 오류는 Core Player 오류와 분리된 메시지로 전달된다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 5 files, 39 tests |
| `npm run build` | PASS |
| `npm run check:manifest` | PASS |

Unit Test에서 Discovery/Selection 요청 분리, Candidate parser, whitelist, schema, 최대 개수, 한국어 Reason, Tag 범위, YouTube 검색 연결, Selection 1회 Retry와 Discovery 미재실행을 확인했다.

## 미검증 외부 항목

실제 OpenAI API 호출과 Web Search 실행은 유효한 사용자 API key가 저장되지 않아 실행하지 않았다. 따라서 실제 계정 권한·모델 접근·API 응답 형식은 아직 외부 환경 확인이 필요하며, Phase 4의 Discovery/Web Search 완료 기준은 미완료로 남긴다.
