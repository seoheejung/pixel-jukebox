# Phase 4. AI Recommendation

> 현재 Track과 Playlist 문맥을 이용한 AI PICKS 구현 및 Discovery/Selection 책임 분리 검증

## 1. 기준 문서

```text
.project/plan.md
→ docs/instructions/phase4-ai-recommendation.md
→ DESIGN.md
→ AGENT.md
```

## 2. 목표

- Discovery와 Selection 분리
- Web Search 기반 Candidate 탐색
- Candidate Parser 및 Candidate Set 구성
- Tool 없는 Structured Output Selection
- Candidate ID 화이트리스트 검증
- 최대 5곡 추천
- YouTube 검색 연결
- AI 실패와 Core Player 오류 격리

## 3. 작업 범위

### Discovery

- Current Track
- Playlist
- Recent Recommendations
- OpenAI Responses API
- Web Search
- 최대 Candidate 10개 초기값
- 고정 Candidate Line Format

### Candidate Parser

- Line Parse
- Candidate ID
- Artist / Track
- 중복 제거
- Candidate Set 생성

### Selection

- Web Search 미사용
- Structured Outputs / JSON Schema
- Candidate ID만 선택
- 최대 Recommendation 5개
- 한국어 Reason
- Music Tag 1~3개

### Validation

- JSON Parse
- Schema
- Candidate Whitelist
- 중복 ID
- 필수 필드
- Selection 1회 Retry
- Partial JSON 폐기

### YouTube

- Candidate 원본 Artist + Track 기반 검색 문자열 생성
- AI 생성 Video ID / URL 사용 금지

### 제외

- Multi-Agent
- Vector DB
- 자체 Recommendation Model
- Playlist 자동 변경
- 추천곡 자동 재생
- 자동 YouTube Video 선택
- Cache 최적화

## 4. Prompt 기준

Prompt 전문은 이 Phase에서 실제 API를 실행하며 확정한다.

### Discovery 핵심 규칙

- 현재 Track이 가장 강한 추천 신호
- Playlist는 보조 문맥
- 현재 Track·Playlist·Recent Recommendation 중복 제외
- 음악적 유사성 우선
- Web Search 기반 후보 탐색
- 없는 곡을 의도적으로 생성하지 않음
- Candidate 최대 10개
- `CANDIDATE|ID|Artist|Track` 형식

### Selection 핵심 규칙

- Candidate Set 내부 ID만 선택
- Artist / Track 새 생성 금지
- 최대 5개
- 한국어 Reason
- Tag 1~3개
- Structured Output만 반환

## 5. 실행 흐름

```text
Context
→ Discovery + Web Search
→ Candidate Parser
→ Candidate Set
→ Selection + Structured Output
→ Application Validation
→ AI PICKS
```

Web Search와 Strict Structured Output을 동일 요청에서 사용하지 않는다.

## 6. 실패 처리

Selection Validation 실패:

```text
동일 Candidate Set
→ Selection 1회 Retry
```

Retry에서 Discovery를 재실행하지 않는다.

Partial JSON은 복구하지 않고 폐기한다.

## 7. 완료 기준

- [ ] Discovery Web Search 실행
- [ ] Discovery에서 Structured Output 미사용
- [ ] Candidate Line Parse
- [ ] Candidate Set 생성
- [ ] Selection에서 Web Search 미사용
- [ ] Structured Output Schema 검증
- [ ] Candidate ID Whitelist 검증
- [ ] Candidate Set 외 ID 차단
- [ ] Artist / Track을 Selection이 새로 생성하지 않음
- [ ] 최대 5개 Recommendation
- [ ] 한국어 Reason
- [ ] Tag 1~3개
- [ ] YouTube 검색 연결
- [ ] Selection 실패 시 1회 Retry
- [ ] Retry 시 Discovery 재실행 없음
- [ ] Partial JSON 자동 복구 없음
- [ ] AI 오류 시 Core Player 정상 유지
