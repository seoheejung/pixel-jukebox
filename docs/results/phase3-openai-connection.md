# Phase 3 — OpenAI 연결

## 구현 범위

OpenAI host permission을 optional로 선언하고, Side Panel에서 사용자가 직접 Enable을 누를 때만 권한을 요청하도록 구성했다. API key 원문은 Side Panel이 `storage.session`에 직접 저장하며, Runtime Message에는 저장 의도와 결과만 전달한다.

영속 저장은 Service Worker가 Session Storage에서 key를 직접 조회한 뒤 `TRUSTED_CONTEXTS` 설정 성공 시에만 Local Storage에 기록한다. 설정 실패 시 Local Storage에 기록하지 않는다. 연결 확인은 사용자가 요청했을 때 Service Worker가 key를 읽어 `/v1/models`에 요청하며, key는 Side Panel·Content Script·로그·응답 메시지로 전달하지 않는다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 4 files, 35 tests |
| `npm run check:manifest` | PASS |
| `npm run test:chrome:phase3` | PASS — Chrome 152.0.7977.76 |

Chrome 검증에서 다음을 확인했다.

- AI 미사용 초기 상태에서 OpenAI optional permission 미부여
- Service Worker의 Local key 조회 성공
- Content Script에서 Local·Session key 조회 차단
- Browser restart 후 Session key 제거
- Runtime 메시지에 key payload 없음

Unit Test에서는 `TRUSTED_CONTEXTS` 설정 실패 시 Local 저장 차단과 Session-only 기본 동작을 확인했다.

## 잔여 범위

Phase 3에서는 추천·Web Search·Discovery·Selection을 호출하지 않는다. 실제 OpenAI 인증 성공 여부는 사용자 key와 네트워크 권한이 필요한 별도 연결 테스트 대상이다.
