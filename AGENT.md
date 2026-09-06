# Pixel Jukebox 작업 규칙

> 이 문서는 Pixel Jukebox 저장소에서 AI Agent가 코드, 테스트, 문서, 설정을 수정할 때 적용하는 공통 작업 기준이다.

---

## 1. 프로젝트 식별자

| 구분 | 값 |
|---|---|
| 프로젝트명 | Pixel Jukebox |
| Repository | `pixel-jukebox` |
| 디렉토리 | `pixel-jukebox/` |
| 최종 기획 기준 | `.project/plan.md` |
| 디자인 기준 | `DESIGN.md` |
| Agent 규칙 | `AGENT.md` |

---

## 2. 문서 우선순위

작업 기준 우선순위는 고정한다.

```text
사용자의 현재 명시적 지시
        ↓
.project/plan.md
        ↓
현재 Phase 지침서
        ↓
DESIGN.md
        ↓
AGENT.md
        ↓
README.md
```

- 사용자의 현재 지시가 가장 높은 우선순위다.
- `.project/plan.md`는 기능 범위와 Phase 범위의 최종 기준이다.
- `DESIGN.md`는 화면, 스타일, 상호작용의 기준이며 기능 범위를 확장할 수 없다.
- 문서 간 충돌이 있으면 상위 우선순위 문서를 따른다.
- 기획 변경 요청이 없는 상태에서 `.project/plan.md` 범위를 임의로 확대하지 않는다.

---

## 3. Phase 범위 관리

- 현재 Phase에 포함된 기능만 구현한다.
- 이후 Phase 기능을 선반영하지 않는다.
- 이후 Phase 전용 파일, 클래스, 설정, API 호출을 미리 추가하지 않는다.
- 현재 Phase에서 필요하지 않은 의존성을 추가하지 않는다.
- 구현하지 않은 기능을 README, 결과 문서, UI에 완료 상태로 표시하지 않는다.
- Phase 완료는 실제 실행과 테스트 결과로만 판정한다.
- 현재 Phase에서 발견된 문제를 해결하기 위해 다른 Phase 기능을 끌어오지 않는다.
- 기획 자체를 바꿔야 하는 경우 코드보다 `.project/plan.md` 수정 여부를 먼저 판단한다.

---

## 4. 기술 기준

| 영역 | 기준 |
|---|---|
| Extension | Chrome Extension Manifest V3 |
| 최소 Chrome | 140 |
| Language | TypeScript |
| UI | HTML / CSS / TypeScript |
| Build | Vite |
| Main UI | Chrome Side Panel |
| Background | Extension Service Worker |
| YouTube 연동 | Content Script |
| Storage | `chrome.storage.local`, `chrome.storage.session` |
| PiP | Document Picture-in-Picture |
| AI | OpenAI Responses API |
| Test | Vitest |

### 기술 선택 제한

- UI Framework는 현재 기획에 포함하지 않는다.
- React, Vue, Svelte를 임의로 도입하지 않는다.
- Backend를 현재 범위에 추가하지 않는다.
- Vector DB, Multi-Agent, 자체 추천 모델을 추가하지 않는다.
- 외부 CDN Script, Remote Hosted Code를 사용하지 않는다.
- Chrome 전체 사이트 접근 권한을 편의 목적으로 추가하지 않는다.

---

## 5. 구현 원칙

- 최소 변경으로 현재 요구사항만 해결한다.
- 기존 동작을 변경하기 전 호출 흐름과 영향 범위를 확인한다.
- YouTube DOM Selector를 추정으로 고정하지 않는다.
- 브라우저 API 지원 여부는 실제 실행 환경에서 확인한다.
- AI 응답을 애플리케이션의 신뢰 가능한 데이터로 바로 취급하지 않는다.
- Candidate Set, Schema Validation, Whitelist 검증을 우회하지 않는다.
- AI 오류가 Player와 Playlist 상태를 깨뜨리지 않도록 경계를 유지한다.
- AI 호출은 사용자의 명시적 `AI PICKS` 실행 또는 `REFRESH PICKS`에서만 발생한다.
- Cache Hit에서는 OpenAI 요청을 수행하지 않는다.

---

## 6. Chrome 메시지 경계

### Content Script

허용 역할:

- 현재 YouTube 영상 정보 감지
- 재생 상태 감지
- 사용자 재생 제어 요청 반영
- Service Worker와 필요한 상태 메시지 교환

금지 역할:

- OpenAI API 직접 호출
- OpenAI API Key 접근
- `Authorization` Header 생성
- AI Candidate/Selection 실행

### Service Worker

책임:

- Tab별 상태 관리
- Storage 접근
- OpenAI API 호출
- AI Workflow 실행
- Side Panel과 Content Script 메시지 중계

### Side Panel

책임:

- Player UI
- Playlist UI
- Design 설정
- AI PICKS UI
- 사용자 입력 이벤트

API Key 원문을 Side Panel 상태에 장기 보관하지 않는다.

---

## 7. API Key 보안 기준

- API Key를 Source Code에 작성하지 않는다.
- API Key를 Git에 Commit하지 않는다.
- API Key를 `chrome.storage.sync`에 저장하지 않는다.
- 기본 저장소는 `chrome.storage.session`이다.
- 사용자가 명시적으로 영속 저장을 선택한 경우에만 `chrome.storage.local`을 사용한다.
- Local 저장 전 `TRUSTED_CONTEXTS` 접근 제한 성공 여부를 확인한다.
- 접근 제한 실패 시 Local 저장을 중단하고 Session 저장을 유지한다.
- Content Script로 API Key를 전달하지 않는다.
- Runtime Message Payload에 API Key를 넣지 않는다.
- Console, Error Log, Test Snapshot에 API Key를 기록하지 않는다.
- `Authorization` Header를 로그로 남기지 않는다.
- AI 연결 해제 시 저장된 Key를 제거한다.

---

## 8. AI PICKS 구현 기준

AI Recommendation은 하나의 Workflow로 유지한다.

```text
Current Track + Playlist + Recent Recommendations
        ↓
Discovery
Responses API + Web Search
Strict Structured Output 미사용
        ↓
Candidate Parser
        ↓
Candidate Set
        ↓
Selection
Responses API / Tool 없음
Strict Structured Output 사용
        ↓
Application Validation
        ↓
AI PICKS
```

### Discovery

- Web Search 사용
- Strict Structured Output 사용 금지
- Candidate Line Format 사용
- 확인되지 않은 후보를 숫자 채우기 목적으로 생성하지 않도록 Prompt 유지

### Selection

- Candidate ID만 선택
- Artist/Track명 직접 생성 금지
- Candidate Set 외 ID 반환 시 실패 처리
- Web Search 사용 금지

### Validation

- JSON Parse
- JSON Schema
- Candidate ID 존재 여부
- Candidate ID 중복 여부
- 최대 추천 개수
- Reason 존재
- Tag 개수

### Retry

- Selection 실패 자동 Retry 초기값 1회
- Retry에서 Discovery 재실행 금지
- Partial JSON 자동 복구 금지
- Retry 횟수 변경은 Phase 5 실측 결과를 근거로 판단

---

## 9. Storage 기준

### `chrome.storage.local`

저장 대상:

- Playlist
- Design Settings
- Recommendation Cache
- Recent Recommendations
- AI Preferences
- 사용자가 명시적으로 영속 저장을 선택한 OpenAI API Key

### `chrome.storage.session`

저장 대상:

- 기본 OpenAI API Key
- 세션 수준 임시 상태

### 상태 변경

- Storage Schema 변경 시 기존 데이터 호환성을 확인한다.
- 필요하지 않은 Migration 코드를 미리 추가하지 않는다.
- 저장 실패를 무시하지 않는다.

---

## 10. UI / 디자인 기준

- 화면 구현은 `DESIGN.md`를 따른다.
- Pixel 감성은 장식보다 Layout, Border, Shadow, Typography, Icon 형태로 표현한다.
- Blur 기반 Glassmorphism 사용 금지.
- 과도한 Gradient 사용 금지.
- 과도한 Animation 사용 금지.
- AI 영역이 Player보다 시각적으로 우선하지 않도록 한다.
- Loading, Empty, Error, Disabled 상태를 구현한다.
- 색상만으로 상태를 구분하지 않는다.
- Side Panel 폭 변화에 대응한다.

---

## 11. 코드 작성 기준

### TypeScript

- `any` 사용을 기본값으로 두지 않는다.
- 외부 데이터와 Runtime Message Payload는 타입 검증 후 사용한다.
- Storage Key는 중앙에서 관리한다.
- Chrome Runtime Message type 문자열을 여러 파일에 중복 작성하지 않는다.
- OpenAI 모델명, Prompt, Schema를 서로 다른 파일에 중복 정의하지 않는다.

### 주석

짧고 직접적인 명사형 표현 사용.

```ts
// 현재 YouTube Track 조회
// Playlist 상태 저장
// Candidate ID 유효성 검증
// OpenAI API Key 세션 저장
```

문장형 종결어미 주석은 사용하지 않는다.

---

## 12. CSS 작성 기준

- Pixel Grid 기준은 `4px` 단위로 유지한다.
- Border는 선명한 정수 Pixel 값 사용.
- Shadow는 Blur 없는 Offset Shadow 우선.
- 외부 Web Font에 의존하지 않는다.
- Font가 필요하면 Extension Package 내부 Asset으로 포함한다.
- CSS Custom Properties로 Palette와 Spacing Token을 관리한다.
- 컴포넌트마다 임의 색상값을 반복 작성하지 않는다.

---

## 13. 테스트 기준

### Unit Test

검증 대상:

- Playlist 순서
- 반복 재생
- Candidate Parser
- Candidate Deduplication
- Candidate Whitelist
- Structured Output Validation
- Cache Key
- Playlist Fingerprint
- AI Error Mapping

### Integration Test

검증 대상:

- Content Script ↔ Service Worker
- Service Worker ↔ Side Panel
- 여러 YouTube Tab 상태 분리
- Storage Save / Restore
- `TRUSTED_CONTEXTS` 실제 접근 차단
- PiP Feature Detection
- AI Discovery / Selection 분리
- Cache Hit 시 OpenAI 요청 0건

### 실제 실행

- Mock 성공만으로 Phase를 완료하지 않는다.
- Browser API는 실제 Chrome에서 검증한다.
- OpenAI 관련 Phase는 실제 API 호출 결과와 Mock 결과를 분리해서 기록한다.
- 실패 결과를 숨기거나 성공으로 치환하지 않는다.

---

## 14. 문서 작성 기준

Phase 결과 문서에는 실제 확인한 내용만 기록한다.

권장 구조:

```text
# Phase N 제목

## 학습 목표

## 실습

### 1. ...
### 2. ...

## 확인 결과
```

- 실행하지 않은 명령을 실행 결과처럼 기록하지 않는다.
- 실제 수치가 없는 성능 개선을 서술하지 않는다.
- Prompt 추천 품질을 실측 전 `정확함`, `우수함`으로 표현하지 않는다.
- 현재 Phase 결과에 이후 Phase 계획을 섞지 않는다.

---

## 15. 금지 작업

- 사용자 요청 없는 `git push`
- 사용자 요청 없는 Force Push
- `git reset --hard`
- 사용자 요청 없는 Rebase
- 실패 상태를 숨기기 위한 Commit
- API Key Commit
- AI 추천 결과를 검증 없이 Playlist에 자동 삽입
- OpenAI 요청을 Track 변경마다 자동 실행
- 현재 Phase 밖 기능 추가
- 공개 서비스 Backend 선반영
- 사용하지 않는 Chrome Permission 추가

---

## 16. 완료 보고 기준

작업 완료 보고에는 실제로 확인한 항목만 포함한다.

```text
변경 파일
실행 명령
테스트 결과
실제 브라우저 검증 결과
남은 미검증 항목
```

확인하지 않은 항목은 `미검증`으로 명시한다.

---

## 17. 완료 판단

현재 Phase는 아래 조건을 모두 만족할 때만 완료로 판정한다.

- 현재 Phase 범위 구현 완료
- 관련 Unit Test 통과
- 필요한 Integration Test 통과
- Browser API 실제 실행 확인
- 보안 기준 위반 없음
- 현재 Phase 범위를 벗어난 선반영 없음
- 실제 결과 문서화 완료
