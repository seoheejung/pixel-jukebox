# Playlist UI · 기기 재질 · YouTube 검색 후속 작업

## 수행 요약

- Home의 독립 Add Music 항목을 제거하고 Playlist 안에 YouTube 링크 입력과 `ADD & PLAY` 버튼을 한 줄로 배치했다.
- D-pad hover가 A/B 라벨 픽셀에 영향을 주지 않도록 라벨을 고정 SVG로 렌더링하고 독립된 페인트 영역으로 유지했다.
- 바깥 배경과 본체를 같은 세라믹 계열 색으로 연결하고, 약한 빛·그림자와 투명 레이어로 경계를 부드럽게 했다.
- AI YouTube 검색은 공식 아티스트 채널을 1순위, 검증된 레이블·배급사의 원본 MV를 2순위로 선택하도록 기준을 명시했다.

## 검증 기준

- 단위 테스트에서 Home 화면 목록과 공식 MV 채널 우선순위를 확인한다.
- Chrome UI 검사에서 Playlist 입력과 버튼의 동일 행 배치, D-pad hover 전후 A/B 영역의 픽셀 동일성, 360/390/480px 화면 범위를 확인한다.
- 실제 OpenAI 호출은 API 키 없이 수행하지 않으며 검색 요청 형식과 resolver 동작은 mock 테스트로 검증한다.

## 검증 결과

2026-09-12 실행 결과:

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 7 files, 57 tests |
| `npm run build` | PASS |
| `npm run test:chrome:ui` | PASS — 360/390/480px, Playlist 동일 행, A/B hover 픽셀 동일성 |

Chrome 검사는 로컬 fixture bridge와 mock API 응답으로 수행했다. 실제 OpenAI 및 YouTube 네트워크 호출은 이번 검증 범위에 포함하지 않았다.
