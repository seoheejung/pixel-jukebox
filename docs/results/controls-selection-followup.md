# 연결 안내 및 추천 selection 오류 보완

2026-09-13

- 연결 안내의 `display: flex`가 `hidden` 표시를 덮어쓰던 CSS 오류를 수정했다. 연결 안내 문구는 스크린리더용으로 유지하고, 재연결 버튼은 음량 줄 안으로 옮겼다. 정상 연결 상태에서는 공간을 차지하지 않는다. 따라서 기존 스크린샷의 안내 문구만으로 실제 연결 단절을 판단할 수 없다.
- 추천 selection 스키마의 candidateId를 실제 후보 ID enum으로 제한했다. 실패 시 같은 후보와 스키마를 유지하되 고정된 검증 오류 설명을 추가해 한 번 재시도한다. 잘못된 ID, 중복 ID, 잘못된 JSON, 빈 응답 등을 구분해 기존 오류 화면으로 전달한다. 응답 원문이나 시크릿은 기록하지 않는다.
- 근거: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)의 enum 지원. 로컬 검증은 계속 유지한다.
- `npm test -- tests/recommendation.test.ts tests/youtube-resolver.test.ts`: 27개 통과.
- `npm run typecheck`, `npm run build`: 통과, dist 반영.
- `npm run test:chrome:audio`: 실제 Chrome 확장 주입, 연결 안내 숨김, 음량 줄 내 버튼 배치, 기존 음량 및 광고 fixture 검증 통과.
- 실제 실패한 AI 응답과 실제 광고 DOM에는 접근하지 못했다. 사용자 환경의 selection 오류 원인과 실제 광고 건너뛰기 성공은 미확인이며, 이번 변경을 실제 서비스 해결 확인으로 간주하지 않는다.
