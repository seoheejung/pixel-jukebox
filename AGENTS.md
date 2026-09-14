# AGENTS.md

> Pixel Jukebox 저장소 공통 작업 규칙.

## Scope

* 사용자 지시와 현재 작업 범위를 우선한다.
* 기능 범위 판단이 필요할 때 `.project/plan.md`를 확인한다.
* UI 변경 시 `DESIGN.md`를 확인한다.
* 현재 범위 밖 기능·의존성·권한을 선반영하지 않는다.
* 자료에 없는 요구사항·경로·명령·결과를 만들지 않는다.

## Boundaries

* Extension UI: 화면·입력·Player·Playlist·Design·AI UI
* Player Bridge: YouTube 재생 전용 HTTPS 영역
* Service Worker: Storage·OpenAI·공유 상태·메시지 처리
* Content Script: 허용된 YouTube 문맥의 제한된 감지·제어

보안 경계:

* OpenAI 요청과 API Key 접근은 Service Worker에서만 수행
* API Key의 소스·Git·로그·DOM·Runtime 메시지 노출 금지
* Player Bridge에 API Key·Playlist 전체 데이터·Chrome Storage 정보 전달 금지
* Auto Skip Ads는 Extension Player의 허용된 YouTube embed 문맥 밖으로 확대 금지

코드 기준:

* TypeScript `any` 금지
* 주석은 짧은 명사형 사용

## Work

* 필요한 파일만 확인하고 이미 확인한 내용의 반복 탐색을 피한다.
* 변경 지점이 확인되면 구현과 직접 관련된 검증까지 진행한다.
* 설계가 확정된 작업을 불필요하게 다시 설계하지 않는다.
* 실제 구현·검증 결과와 계획을 구분한다.

## Ask before

* 신규 의존성 또는 lock 파일 변경
* Chrome 권한 확대
* 배포·퍼블리싱·운영 데이터 변경
* 파괴적 Git 작업 또는 force push
* 시크릿 파일 열람·외부 전송

## Done

요청 범위 구현과 직접 관련된 검증까지 완료한다.

최종 보고에는 변경 파일, 수행한 검증, 남은 미검증·리스크만 간결하게 기록한다.
