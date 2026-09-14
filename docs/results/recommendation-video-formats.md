# 추천 영상 형식 확장

- 사용자 요청으로 공식 MV 외에 Concept Video, Performance Video, Lyric Video를 허용하도록 일괄 검색·개별 보충 검색 프롬프트를 수정했다.
- 공식 아티스트·레이블·배급사 채널 우선순위와 곡 전체 영상 조건을 유지한다. Concept Video를 짧은 티저와 구분하며 팬 제작 가사 영상은 제외한다.
- 기존 YouTube 메타데이터 검증에는 이 세 형식을 차단하는 조건이 없어 변경하지 않았다.
- `npm test -- tests/youtube-resolver.test.ts`: 20개 통과. `npm run typecheck`, `npm run build` 통과. dist 반영 완료. 실제 OpenAI 검색 응답은 미검증이다.
