# geo-select

Interactive world map based region selector (core). \n국가나 지역을 지도에서 클릭/검색해 선택하면 ISO 코드·이름·중심 좌표 등을 반환합니다.

## 핵심 아이디어

- 드롭다운 대신 지도에서 직접 국가/지역(또는 행정구역)을 클릭해 선택
- 검색박스와 하이라이트 동기화, 대륙 필터링 지원
- 프레임워크 독립적인 core로 시작 → 필요시 React/Vue 래퍼 제공

## Quick demo

https://muganghskim.github.io/geo-select/

## 설치

```bash

# npm

npm i geo-select-core

# 또는 레포에서 직접 테스트

git clone https://github.com/muganghskim/geo-select.git

cd geo-select/packages/core

npm install

npm run build
