# Phase 0 — Extension 기반 구성

## 학습 목표와 구현 범위

Manifest V3, Chrome 140 이상, Vite/TypeScript 빌드, Service Worker, YouTube Content Script, Side Panel 및 Runtime Port 통신만 구현했다. Player·Storage·AI 기능은 포함하지 않았다.

Content Script는 독립 IIFE 번들이며, Worker와 Panel은 패키지 내부 ES Module을 사용한다. YouTube 최상위 프레임과 패널 문서의 송신자를 확인하고 연결 종료를 격리한다. 필요한 권한은 `sidePanel` 하나이며 Content Script 실행 범위는 `https://www.youtube.com/*`이다.

## 실행 결과

검증 환경: Windows, Node 24.19.0, npm 11.17.0, Chrome 152.0.7977.76.

| 명령 | 실제 결과 |
|---|---|
| `npm install` | 승인 후 설치 성공, 49개 패키지 추가, npm audit 보고 취약점 0개 |
| `npm run build` | Vite 7.3.6, Panel/Worker 및 Content Script 두 빌드 성공 |
| `npm run typecheck` | TypeScript 검사 성공 |
| `npm test` | Vitest 4.1.11, 1개 파일·14개 테스트 통과 |
| `npm run check:manifest` | 원본/빌드 Manifest, 최소 권한, 진입 파일, Content Script 형식 검사 통과 |
| `npm run chrome:start` | 전용 프로필 Chrome 실행 성공; 현재 실행 도구에서는 샌드박스 밖 실행 필요 |
| `npm run test:chrome` | 실제 Chrome Developer Mode, unpacked 로드, Side Panel, YouTube 연결, 권한 및 화면 캡처 확인 |

처음에는 의존성 미설치로 Build/Type Check/Test가 실행되지 않았다. 승인된 설치 후 모두 재검증했다. Chrome 실행은 샌드박스 내 프로세스 종료로 연결 실패가 발생하여 실행 환경을 변경했다. 최초 Chrome 테스트의 `triggerAction`에 page target을 전달한 테스트 도구 오류는 tab target을 사용하도록 수정하고 재실행해 통과했다.

## 확인 결과

- [x] Extension Build 성공
- [x] Chrome Developer Mode 및 unpacked 로드 성공 — CDP 자동화
- [x] Chrome 140 이상 확인 — 152.0.7977.76
- [x] 실제 YouTube 페이지에서 Content Script 실행
- [x] 실제 Side Panel 실행 — Extension action 호출
- [x] Content Script → Service Worker 통신
- [x] Service Worker → Side Panel 통신 및 패널 연결 재확인 버튼
- [x] 사용하지 않는 Permission 없음 — `chrome.permissions.getAll()` 확인
- [x] 이후 Phase 기능 선반영 없음

## 검증 한계

Vitest는 Chrome API Mock 기반 통합 테스트이다. Chrome 검증은 별도의 headless Chrome 프로세스에서 실제 Extension API로 실행했으며 Mock으로 대체하지 않았다. 캡처한 360px 패널 화면을 확인했다. 일반 사용자 프로필에서 수동으로 메뉴를 클릭하는 검증은 실행하지 않았다. 테스트 프로필과 캡처는 `.chrome-test/`에 두고 Git에서 제외했다.

Public API 변경 없음. npm 설치에서 esbuild postinstall 승인 안내가 있었으나 추가 스크립트 승인을 하지 않고도 실제 빌드가 통과했다.
