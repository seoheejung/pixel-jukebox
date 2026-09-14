# Pixel Jukebox Instructions

> Pixel Jukebox Chrome Extension 저장소의 아키텍처 경계, 불변 조건, 완료 기준이다.

## 1. Documentation Index

작업 컨텍스트에 따라 필요한 경우 아래 문서를 참조한다.
- 범위 판단이 필요할 때: `.project/plan.md`
- UI를 변경할 때만: `DESIGN.md`

## 2. Architecture & Security Boundaries

각 컴포넌트의 책임과 보안 경계를 엄격히 유지한다.

| 구성 요소 | 역할 및 상태 책임 | 보안 / 불변 조건 |
|---|---|---|
| **Content Script** | YouTube 탭 상태 감지 및 재생 제어 | • OpenAI 직접 호출 금지<br>• API Key 접근 금지 |
| **Service Worker** | Tab/Storage 관리, OpenAI 네트워크 호출, 공유 Core 상태 조정 | • 모든 외부 AI 통신 및 Key 저장소 전담 |
| **Extension UI** | 화면·입력·탐색·재생 제어 상태 (`src/sidepanel`, popup, 별도 창) | • OpenAI 호출 및 공유 Core 조정은 Worker로 위임 |

### 보안 및 코드 품질 사실
- API Key는 소스 코드, Git 히스토리, 콘솔 로그, Runtime 메시지 페이로드에 절대 노출하지 않는다.
- TypeScript `any` 타입을 사용하지 않는다.
- 코드 주석은 문장형 종결어미 대신 간결한 명사형 표현을 사용한다.
- Content Script, 메시지, 저장소, OpenAI 통신 경계를 변경한 경우 API Key 노출 여부를 필수 확인한다.

## 3. Subagent Delegation

- 서브에이전트는 작업이 독립적으로 분리되고 컨텍스트 절감 이득이 명확할 때만 사용한다.
- 사용할 경우 다음 역할 구분을 참고한다:
  - 다중 파일 탐색/영향도 분석: `explorer` (read-only)
  - 단순·반복적 코드 수정: `luna_worker` (workspace-write)

## 4. Definition of Done

- 요청한 결과와 직접 관련된 동작을 가능한 환경에서 확인하고, 변경으로 발생한 실패를 수정·재검증한다.
- 변경 규모와 영향 범위에 맞는 직접 검증을 수행한다:
  - **TypeScript/로직 변경**: 관련 단위 테스트 및 타입 검사
  - **CSS/UI 변경**: 반응형 레이아웃(320px/390px/480px) 및 화면 깨짐 확인
  - **문서 변경**: 링크 및 형식 유효성 확인
- 필요한 작업과 검증이 모두 끝난 뒤 최종 보고를 작성한다.

### 보고 형식
- **변경 파일**: 수정한 파일 경로
- **검증 명령 및 결과**: 실행한 빌드/테스트 또는 화면 동작 확인 내용
- **미검증/리스크**: 환경 제약으로 확인하지 못한 항목이 있는 경우만 기재