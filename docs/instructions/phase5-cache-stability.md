# Phase 5. Cache · 안정성 검증

> AI PICKS의 반복 호출 비용, 실패 경로, 권한, 보안 및 전체 Extension 안정성 검증

## 1. 기준 문서

```text
.project/plan.md
→ docs/instructions/phase5-cache-stability.md
→ DESIGN.md
→ AGENT.md
```

## 2. 목표

- 동일 Context 반복 호출 방지
- Recommendation Cache
- REFRESH PICKS
- Recent Recommendations
- AI 오류 경로 검증
- Selection Retry 동작 검증
- Permission 및 API Key 보안 재검토
- Remote Hosted Code 부재 확인
- AI 비활성 상태 OpenAI 요청 0건 검증

## 3. 작업 범위

### Cache

- `currentTrack.videoId`
- `playlistFingerprint`
- Cache Hit / Miss
- Recommendation 저장
- REFRESH PICKS Cache 우회
- Recent Recommendations 반영

### 실패 경로

- Discovery Candidate 0건
- Candidate Parse 실패
- JSON Parse 실패
- Schema Validation 실패
- Candidate Whitelist 실패
- Selection Retry 성공
- Selection Retry 재실패
- 인증 오류
- Rate Limit
- API 사용량·결제 오류

### 보안 및 Permission

- API Key 저장 경로 재검토
- Content Script Key 접근 재검토
- Console / Error Log 점검
- Optional Host Permission
- 사용하지 않는 Permission
- Remote Hosted Code

### 제외

- Backend
- 사용자 인증
- 결제
- Multi-Agent
- 자체 Recommendation Model
- Retry 횟수 자동 최적화

## 4. Cache 기준

```text
cacheKey
=
currentTrack.videoId
+
playlistFingerprint
```

Playlist 순서를 Fingerprint에 반영한다.

Cache Hit:

```text
기존 Recommendation 표시
→ OpenAI 요청 0건
```

REFRESH PICKS:

```text
기존 Recommendation
→ recentRecommendations 반영
→ Cache 우회
→ Discovery 재실행
```

## 5. Retry 기준

Selection 실패 자동 Retry 초기값은 1회다.

1회가 최적값이라는 의미가 아니다.

실제 실패 횟수, 비용, 응답 시간을 기록하고 변경 필요성을 판단한다.

Selection Retry에서는 Web Search를 다시 실행하지 않는다.

## 6. 측정 항목

- Cache Hit / Miss
- Discovery 호출 횟수
- Selection 호출 횟수
- Retry 발생 횟수
- 전체 응답 시간
- OpenAI Usage
- 실제 비용
- Candidate Parse 실패
- Structured Output 실패
- AI 비활성 상태 API 요청 수

## 7. 완료 기준

- [ ] 동일 Context Cache Hit
- [ ] Cache Hit 시 OpenAI 요청 0건
- [ ] REFRESH PICKS Cache 우회
- [ ] Recent Recommendations 반영
- [ ] Discovery 실패 UI 처리
- [ ] Candidate Parse 실패 처리
- [ ] Selection 실패 시 Web Search 재호출 없음
- [ ] Selection 1회 Retry 검증
- [ ] Retry 재실패 UI 처리
- [ ] Partial JSON 자동 복구 없음
- [ ] Candidate Set 외 결과 표시 없음
- [ ] 인증 / Rate Limit / 사용량 오류 처리
- [ ] API Key 노출 없음
- [ ] AI 비활성 상태 OpenAI 요청 0건
- [ ] AI 오류와 Core Player 오류 격리
- [ ] 불필요한 Permission 없음
- [ ] Remote Hosted Code 없음
