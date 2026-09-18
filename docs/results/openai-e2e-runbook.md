# 실제 OpenAI E2E 측정 절차

## 목적

실제 Chrome Extension의 Service Worker 경계에서 OpenAI Responses API 1회, Web Search, YouTube oEmbed 검증까지 실행한다. 기준곡 1개를 한 번만 실행해 TRACK 반환 수, Primary/Backup 수, 실제 YouTube source 연결 수, 최종 추천 수, 단계별 Usage, 전체 응답시간과 예상 비용을 `docs/results/openai-e2e-*.md`로 기록한다.

API Key 원문과 Authorization Header, OpenAI 원본 응답은 스크립트와 보고서에 전달하거나 기록하지 않는다. 사용자는 열린 Extension UI에 Key를 직접 입력하며 Key는 기존 정책대로 `chrome.storage.session`에서만 사용한다.

## 실행

먼저 빌드한 뒤 첫 번째 터미널에서 격리된 Chrome을 화면에 연다.

```sh
npm run build
npm run chrome:start -- --headed
```

두 번째 터미널에서 실제 측정을 시작한다.

```sh
npm run test:openai:e2e -- --seed=Radiohead
```

OpenAI가 연결되지 않은 경우 스크립트가 Pixel Jukebox 창을 앞으로 가져온다. 그 창에서 API Key를 입력하고 `CONNECT`를 누르면 같은 실행이 자동으로 이어진다. 측정이 끝나면 기존 테스트 Profile의 Playlist를 복원한다.

측정 종료 후 Chrome을 닫는다.

```sh
npm run chrome:stop
```

## 결과 판정

- 자동 기록: Responses API 요청 수, Web Search tool 호출 수, TRACK 반환 수(10 Primary + 2 Backup), 실제 YouTube source 연결 수, URL/videoId 및 oEmbed 통과 수, Artist 다양성, 중복, 단계별 토큰·시간·예상 비용
- 완료 처리: Responses API 요청 1회, Selection/Retry/Supplemental 요청 0회, YouTube 중복 검증, 최종 추천 수·응답 시간·Usage·비용 계측
- 미완료: 기준곡 직후의 음악적 흐름 청취 평가와 Backup 교체 품질
- 다음 분석: TRACK → URL/videoId → oEmbed 단계별 drop count를 수집해 최종 생존율 부족 원인을 분리
- 비용은 측정 시점 공식 OpenAI 가격표와 Responses Usage로 계산한 예상값이다. 현재 측정 대상 모델은 `gpt-5.6-luna`이며, 최종 청구 금액은 계정 Billing 내역을 기준으로 한다.
# Known Limitations

- 최종 추천 수가 내부 목표 12곡보다 적을 수 있음
- E2E runner가 실제 UI 완료 상태를 감지하지 못하고 timeout될 수 있음
- Resolver 및 YouTube video verification 처리 시간이 길어질 수 있음
- timeout 또는 실패 실행은 성공 보고서로 기록하지 않음
