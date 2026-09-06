# Phase 3. OpenAI 연결

> AI PICKS 사용자를 위한 선택적 OpenAI 연결과 API Key 보안 경계 검증

## 1. 기준 문서

```text
.project/plan.md
→ docs/instructions/phase3-openai-connection.md
→ DESIGN.md
→ AGENT.md
```

## 2. 목표

- AI 기능 완전 Opt-in 유지
- OpenAI Optional Host Permission 요청
- API Key 기본 Session 저장
- 선택적 Local 영속 저장
- `TRUSTED_CONTEXTS` 실제 차단 검증
- Service Worker 전용 OpenAI 요청 경계 구성
- Key 노출 방지

## 3. 작업 범위

### 포함

- `optional_host_permissions`
- AI 활성화 시 Permission 요청
- Permission 거부 처리
- API Key 입력·제거
- `chrome.storage.session`
- 선택적 `chrome.storage.local`
- `storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`
- Service Worker 전용 OpenAI 요청 경로
- Key 노출 검증
- AI 설정 최소 UI

### 제외

- 음악 Recommendation
- Web Search
- Discovery Prompt
- Candidate Parser
- Selection
- Recommendation Cache

## 4. 보안 기준

### 기본 저장

```text
API Key
→ chrome.storage.session
```

### 영속 저장

```text
사용자 명시적 선택
        ↓
setAccessLevel(TRUSTED_CONTEXTS)
        ↓
성공
        ↓
storage.local 저장
```

실패 시:

```text
Local 저장 금지
→ storage.session 유지
```

### 금지

- Source Code 포함
- Git Commit
- `storage.sync` 저장
- Content Script 전달
- DOM 삽입
- Runtime Message Payload 포함
- Console 출력
- 오류 로그 출력
- Authorization Header 로그

## 5. OpenAI 요청 경계

```text
Side Panel
→ 요청 의도 전달
→ Service Worker
→ Storage에서 Key 직접 조회
→ OpenAI API
```

API Key 원문을 Side Panel과 Content Script로 전달하지 않는다.

Phase 3에서는 음악 추천을 호출하지 않는다.

OpenAI 연결 확인용 요청을 추가할 경우 최소 범위로 제한하고 실제 수행 여부를 문서화한다.

## 6. `TRUSTED_CONTEXTS` 실측

플랫폼 문서 존재만으로 완료 처리하지 않는다.

실제 Extension 환경에서 아래를 확인한다.

- `setAccessLevel()` 성공
- Service Worker에서 Local Key 조회 성공
- Content Script에서 동일 Key 조회 실패
- 실패 시 Local 저장 차단

## 7. 완료 기준

- [ ] AI 미사용 시 OpenAI Host Permission 미요청
- [ ] AI 활성화 시 Permission 요청
- [ ] Permission 거부 처리
- [ ] 기본 API Key Session 저장
- [ ] Browser Restart 후 Session Key 제거
- [ ] 영속 저장 미선택 시 Local Key 없음
- [ ] `TRUSTED_CONTEXTS` 실제 동작 확인
- [ ] Service Worker Local Key 조회 성공
- [ ] Content Script Local Key 조회 실패
- [ ] 접근 제한 실패 시 Local 저장 차단
- [ ] Content Script Session Key 조회 실패
- [ ] Runtime Message에 Key 없음
- [ ] Console·오류 로그에 Key 없음
- [ ] 연결 해제 시 저장 Key 제거
- [ ] AI Recommendation 선반영 없음
