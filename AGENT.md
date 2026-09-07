# Pixel Jukebox 작업 규칙 (`AGENT.md`)

> 본 문서는 Pixel Jukebox 작업 공통 기준이다. 세부 기획은 `.project/plan.md`, 화면은 `DESIGN.md`를 단일 진실 공급원(SSOT)으로 삼는다.
> 

## 1. 프로젝트 기준 및 우선순위

- **프로젝트**: `Pixel Jukebox` (`pixel-jukebox/`)
- **우선순위**: 사용자 명시적 지시 > `.project/plan.md` > 현재 Phase 지침서 > `DESIGN.md` > `AGENT.md` > `README.md`
- **Phase 제약**: 현재 Phase 범위만 구현. 이후 Phase 파일·설정·API·의존성 선반영 금지. 기획 변경 시 코드 대신 `.project/plan.md` 우선 수정.
- **기술 스택**: Chrome Extension MV3(최소 v140), TS, Vite, Side Panel, Service Worker, Content Script, Vitest, OpenAI Responses API.
- **스택 금지**: React/Vue/Svelte, 자체 Backend, Vector DB, Multi-Agent, 외부 CDN/원격 코드, 불필요한 전체 사이트 접근 권한.

## 2. Chrome 메시지 경계 및 보안

- **Content Script**: YouTube 영상/재생 상태 감지 및 제어만 담당. DOM Selector 추정 고정 금지. OpenAI API 호출, API Key 접근, `Authorization` 헤더 생성, AI Selection 실행 절대 금지.
- **Service Worker**: Tab 상태 관리, Storage 접근, OpenAI API 호출, AI Workflow 실행, 메시지 중계 전담.
- **Side Panel**: Player/Playlist/Design/AI UI 및 입력 이벤트 담당. API Key 장기 보관 금지.
- **API Key 보안**: 소스/Git/로그/콘솔/테스트 스냅샷/Runtime 메시지 노출 금지. `chrome.storage.session` 기본 저장. `chrome.storage.local`은 사용자 명시적 영속 선택 시 `TRUSTED_CONTEXTS` 접근 제한 성공 시에만 허용.

## 3. AI PICKS 파이프라인

단일 파이프라인 유지: `Current Track + Playlist + Recent Recommendations` → `Discovery` → `Candidate Parser` → `Candidate Set` → `Selection` → `Application Validation` → `AI PICKS`

- **Discovery**: Responses API + Web Search 사용. Strict Structured Output 미사용. Candidate Line Format 준수 (미확인 후보 지어내기 금지).
- **Selection**: Responses API 단독 (Web Search 금지). Strict Structured Output 사용. Candidate ID만 선택 (아티스트/트랙명 직접 생성 금지, 후보 외 ID 반환 시 실패).
- **Validation**: JSON Parse, JSON Schema, Candidate ID 존재/중복, 최대 개수, Reason, Tag 수 검증.
- **실행·재시도**: 사용자의 명시적 `AI PICKS` / `REFRESH PICKS`에서만 호출 (트랙 변경 시 자동 호출 금지). Cache Hit 시 API 요청 0건. Selection 실패 시 Discovery 재실행 없이 1회 한정 자동 Retry (Partial JSON 자동 복구 금지).

## 4. Storage & UI 기준

- **`chrome.storage.local`**: Playlist, Design Settings, Recommendation Cache, Recent Recommendations, AI Preferences, 영속 선택된 API Key.
- **`chrome.storage.session`**: 기본 API Key, 세션 임시 상태.
- **UI/CSS**: `DESIGN.md` 준수. `4px` 그리드, 정수 px 테두리, No-blur 오프셋 그림자. Glassmorphism/과도한 그라디언트·애니메이션 금지. 외부 Web Font 금지(내부 에셋화). CSS 변수로 팔레트/간격 관리. 로딩·빈화면·에러·비활성화 상태 필수 구현.

## 5. 코드 & 주석 작성 기준

- **TypeScript**: `any` 금지. 런타임 메시지/Storage Key/OpenAI 모델명·프롬프트·스키마 중앙 집중 타이핑 및 중복 정의 금지.
- **주석**: 문장형 종결어미 금지. 짧고 직접적인 명사형 표현만 사용.TypeScript
    
    ```
    // 현재 YouTube Track 조회
    // Playlist 상태 저장
    // Candidate ID 유효성 검증
    // OpenAI API Key 세션 저장
    ```
    

## 6. 테스트 기준

- **Unit Test 검증 대상**: Playlist 순서, 반복 재생, Candidate Parser, Candidate Deduplication, Candidate Whitelist, Structured Output Validation, Cache Key, Playlist Fingerprint, AI Error Mapping.
- **Integration Test 검증 대상**: Content Script ↔ Service Worker, Service Worker ↔ Side Panel, 복수 YouTube Tab 상태 분리, Storage Save / Restore, `TRUSTED_CONTEXTS` 접근 차단, PiP Feature Detection, AI Discovery / Selection 분리, Cache Hit 시 OpenAI 요청 0건.
- **실제 실행 원칙**: Mock 성공만으로 Phase 완료 불가. Chrome 환경 실제 실행 검증 필수. OpenAI API 실제 호출과 Mock 결과를 분리 기록. 실패 은폐 금지.

## 7. 문서화, 보고 및 완료 판단

### Phase 결과 문서 표준 구조

Plaintext

```
# Phase N 제목
## 학습 목표
## 실습
### 1. ...
### 2. ...
## 확인 결과
```

*(미실행 명령 기록 금지, 실측 없는 성능/품질 과장 금지, 차기 Phase 내용 혼입 금지)*

### 완료 보고 필수 5대 항목

Plaintext

```
변경 파일
실행 명령
테스트 결과
실제 브라우저 검증 결과
남은 미검증 항목 (확인 불가 시 '미검증' 명시)
```

### Phase 완료 판정 7대 조건

1. 현재 Phase 범위 구현 완료
2. 관련 Unit Test 통과
3. 필요한 Integration Test 통과
4. Browser API 실제 실행 확인
5. 보안 기준 위반 없음
6. Phase 범위 외 선반영 없음
7. 실제 결과 문서화 완료

## 8. 금지 작업 (Forbidden)

- 사용자 요청 없는 `git push`, Force Push, `git reset --hard`, `git rebase`, 실패 은폐용 커밋, API Key 커밋.
- AI 추천 결과 검증 없는 Playlist 자동 삽입, 트랙 변경 시 자동 OpenAI 호출.
- 미승인 의존성/Backend 선반영, 미사용 Chrome 권한 추가.