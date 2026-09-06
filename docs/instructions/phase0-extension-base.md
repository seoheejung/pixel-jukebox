# Phase 0. Extension 기반 구성

> Manifest V3 기반 Chrome Extension의 최소 실행 구조와 메시지 연결 검증

## 1. 기준 문서

작업 전 아래 문서를 순서대로 확인한다.

```text
.project/plan.md
→ docs/instructions/phase0-extension-base.md
→ DESIGN.md
→ AGENT.md
```

기능 범위는 `.project/plan.md`가 최종 기준이다.

## 2. 목표

- Chrome 140 이상에서 Manifest V3 Extension 로드
- Vite + TypeScript 최소 Build 구성
- Service Worker, Content Script, Side Panel 연결
- YouTube 대상 Content Script 실행
- Runtime Messaging 기본 흐름 검증
- 현재 단계에 필요한 최소 Permission만 선언

## 3. 작업 범위

### 포함

- `manifest.json`
- `minimum_chrome_version: "140"`
- TypeScript
- Vite
- Background Service Worker
- YouTube Content Script
- Side Panel 최소 화면
- `chrome.runtime` Messaging
- `sidePanel`, `storage` 등 실제 필요한 최소 Permission
- 개발용 Build 명령
- Vitest 최소 테스트 환경

### 제외

- YouTube Track 상세 감지
- LP/CD Player
- Playlist
- Design 설정 기능
- PNG/GIF
- Document PiP
- OpenAI
- AI PICKS
- 이후 Phase 전용 파일

## 4. 구현 순서

### 4.1 프로젝트 기반 구성

- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `manifest.json`
- 최소 Source Directory

현재 Phase에서 사용하지 않는 디렉토리와 파일은 미리 만들지 않는다.

### 4.2 Service Worker

- Extension 기동 확인
- 메시지 수신 최소 처리
- 민감 데이터 처리 없음

### 4.3 Content Script

- `https://www.youtube.com/*`에서 실행 확인
- 현재 Phase에서는 Track 정보 분석 금지
- Service Worker로 테스트 메시지 전송

### 4.4 Side Panel

- `DESIGN.md`의 Phase 0 범위만 적용
- 최소 Shell 및 상태 표시
- Service Worker와 메시지 송수신 확인

### 4.5 Permission 검토

필요하지 않은 권한은 선언하지 않는다.

특히 구현 근거 없이 아래 권한을 추가하지 않는다.

```text
tabs
scripting
<all_urls>
https://api.openai.com/*
```

## 5. 검증

### Build

- TypeScript 오류 없음
- Vite Build 성공
- Extension 로드 가능한 결과물 생성

### Chrome

- Chrome 140 이상 확인
- Developer Mode에서 Extension 로드
- Side Panel 열기
- YouTube 페이지에서 Content Script 실행 확인

### Messaging

```text
Content Script
→ Service Worker
→ Side Panel
```

각 경로의 실제 메시지 도착 확인.

## 6. 완료 기준

- [ ] Extension Build 성공
- [ ] Chrome Developer Mode 로드 성공
- [ ] Chrome 140 이상 확인
- [ ] YouTube Content Script 실행
- [ ] Side Panel 실행
- [ ] Content Script → Service Worker 통신 확인
- [ ] Service Worker → Side Panel 통신 확인
- [ ] 사용하지 않는 Permission 없음
- [ ] 이후 Phase 기능 선반영 없음

## 7. 완료 후 기록

실제 구현·검증이 끝난 뒤에만 Phase 결과 문서를 작성한다.

미실행 결과, 예상 성공값, 이후 Phase 계획은 완료 결과로 기록하지 않는다.
