# AGENTS.md

> Pixel Jukebox 저장소 공통 작업 규칙.

## Scope

- 사용자 지시와 현재 Phase 범위를 우선한다.
- 기능 범위 판단이 필요할 때 `.project/plan.md`를 확인한다.
- UI를 변경할 때 `DESIGN.md`를 확인한다.
- 현재 Phase 밖 기능, 의존성, 권한, 운영 정책을 선반영하지 않는다.
- 자료에 없는 요구사항·경로·명령·결과를 만들지 않는다.

## Work

- 필요한 파일만 읽고 이미 확인한 내용의 재탐색을 피한다.
- 변경 지점이 확인되면 구현과 검증으로 진행한다.
- 로컬 테스트는 안전한 검증 수단으로 취급한다. 변경으로 발생한 실패를 수정하고 관련 테스트를 다시 실행한다.
- 설계가 끝난 작업을 다시 설계하지 않는다.

## Project boundaries

- Content Script: YouTube 상태 감지·재생 제어
- Service Worker: Tab·Storage·OpenAI·AI Workflow·메시지 중계
- Extension UI (`src/sidepanel`, action popup·별도 창): Player·Playlist·Design·AI UI
- Content Script의 API Key 접근·OpenAI 호출 금지
- API Key의 소스·Git·로그·Runtime 메시지 노출 금지
- TypeScript `any` 금지
- 코드 주석은 짧은 명사형 사용

## Ask before

- 신규 의존성 또는 lock 파일 변경
- 배포·퍼블리싱·운영 데이터 변경
- 파괴적 Git 작업 또는 force push
- 시크릿 파일 열람·외부 전송

## Done

요청 범위 구현과 직접 관련된 검증까지 완료한다.

최종 보고에는 변경 파일, 실행한 검증, 실패 또는 미검증 항목만 간결하게 기록한다.
