# 음량·광고 건너뛰기

## 2026-09-13 탐지 보완

- 사용자 확인: 음량 조절 정상, 확장 새로고침 완료. 같은 연결로 설정이 전달되므로 버튼 탐지 문제를 우선 점검했다. 실제 광고 DOM에서 원인을 확정한 것은 아니다.
- `public/youtube-controls.js`: 기존 CSS 선택자에 더해 플레이어 내부 버튼의 한국어·영어 접근성 이름과 문구로 건너뛰기를 탐지한다. 카운트다운 문구는 새 탐지 경로에서 제외하고, 기존 숨김·비활성·투명도 검사를 유지한다. 문구와 접근성 속성 변경도 관찰한다.
- `scripts/test-chrome-audio.mjs`: 기존 클래스 없는 한국어 버튼, 영어 role 버튼, 카운트다운, 무관한 Skip intro 버튼에 대한 회귀 검증을 추가했다.
- 검증 통과: `npm run typecheck`, `npm run build`, `npm run check:manifest`, `node --check public/youtube-controls.js`, `npm run test:chrome:audio`.
- Chrome 테스트는 샌드박스 내 탭 생성 시간 초과 후 샌드박스 밖에서 통과했다. 실제 Chrome 확장 주입과 테스트용 광고 화면을 검증했으며, 실제 YouTube 광고에서의 성공 여부는 미검증이다.
- 새 코드는 `dist` 빌드에 반영했다. 사용 중인 확장을 새로고침하고 플레이어를 다시 열어야 적용된다.

2026-09-12 사용자 요청 구현.

- Now Playing 하단에 0–100 음량 슬라이더, MUTE/UNMUTE, 현재 값을 추가했다. 음량·음소거·자동 Skip 설정은 확장 origin의 localStorage에 저장한다.
- Settings의 Auto Skip Ads 기본값은 ON이다. 광고 재생 상태에서 실제로 표시되고 활성화된 Skip 버튼만 누른다. 건너뛰기 불가 광고를 강제 종료하거나 영상 시간을 이동하지 않는다.
- `public/youtube-controls.js`는 YouTube embed 문서에 주입되지만 정확히 이 확장 → 기존 HTTPS bridge → YouTube의 ancestry에서만 작동한다. 영상 DOM의 음량을 적용하므로 remote bridge 배포는 필요 없다. 콘텐츠 스크립트와 origin 검증은 API 키 저장 영역에 접근하지 않는다.
- 콘텐츠 스크립트 등록을 반영하려면 확장 프로그램을 다시 로드하고 플레이어를 다시 열어야 한다.
- [Chrome 콘텐츠 스크립트](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [HTMLMediaElement.volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume)을 사용한다.

## 검증

- `npm test`: PASS, 7 files / 57 tests. 아티스트 다양성 규칙에 대한 추천 요청 검증 포함.
- `npm run typecheck`, `npm run build`, `npm run check:manifest`: PASS.
- `npm run test:chrome:ui`: PASS, 기존 재생/추천/화면 전환, 360/390/480px 배치.
- `node scripts/test-chrome-audio.mjs`: PASS. 실제 unpacked 확장을 Chrome에 로드하고 HTTPS bridge/YouTube 요청은 fixture로 대체했다. 자동 콘텐츠 스크립트 주입, 실제 video.volume/muted 값, 음소거 해제 시 음량 복원, 문서 재로드·video 교체 시 설정 적용을 확인했다.
- 같은 브라우저 검사에서 숨김·비활성 Skip 제외, 활성 Skip 클릭, OFF/ON 전환, 일반 YouTube 문서 미적용, 동일 프레임의 위조 메시지 거절을 확인했다.
- 중첩 프레임 로딩 순서로 음량 연결이 초기화되던 문제는 주기적 연결 확인으로 수정했다. 광고 fixture는 실제 사용처럼 재생 화면이 보이는 상태에서 검사했다.
- 캡처: `.chrome-test/gameboy-volume.png`. 화면의 Skip Ad는 실제 광고가 아닌 fixture다.

실제 광고 송출·음원 청취·실제 AI 응답 품질은 미검증이다. YouTube가 Skip 버튼 DOM을 변경하면 탐지 규칙 보완이 필요할 수 있다. 배포와 의존성/lock 변경은 하지 않았다.
