# 이랜드그룹 리스크 관리 시스템 — 프로젝트 가이드

## 프로젝트 개요
- 이랜드그룹 8대 리스크를 모니터링·집계·시각화하는 사내 대시보드
- 백엔드: Supabase (URL/Anon Key는 `app.js` 상단)
- 외부 라이브러리: Supabase JS, Chart.js, pptxgenjs (CDN으로 로딩)
- 사용자(소유자)는 비개발자 — 설명·제안은 평이한 한국어로

## 파일 구조 (2026-05-22 분리 완료, 2026-05-28 로그인 추가)
- `index.html` — 화면 구조. `<head>`에서 `style.css`, `<body>` 끝에서 `app.js` 로딩
- `style.css` — 모든 디자인. CSS 변수 `:root` 블록 참조
- `app.js` — 모든 동작(Supabase 호출, 렌더, 모달, 입력/수정/삭제, 인증 게이트, 회원관리)
- `login.html` — 로그인·회원가입·승인대기 화면(단일 파일, 자체 스타일·스크립트 포함)
- `index_backup.html` — 분리 직전 원본 백업. 안정화되면 삭제 가능 (Git에도 이력 있음)
- `README.md` — 거의 비어있음

**GitHub 배포 시 주의:** index.html / login.html / style.css / app.js 네 파일을 함께 업로드해야 동작함.

## 인증 / 권한 (2026-05-28)
- Supabase Auth(Email/Password) 사용
- `profiles` 테이블에 가입정보 + `approved` 플래그 저장
- 관리자: 가비님(`gabeenya@gmail.com`) 1명. `ADMIN_EMAIL` 상수 + RLS 정책에서 동일 이메일 비교
- 미로그인/미승인 → `login.html`로 자동 이동
- 사이드바 "회원 관리" 메뉴는 관리자 이메일일 때만 표시

## 디자인 변수 (style.css `:root`)
색을 바꾸고 싶으면 가능하면 변수만 수정. 개별 셀렉터 수정 최소화.
- 브랜드: `--red` `--red-dark` `--red-light` `--navy` `--navy2`
- 배경/표면: `--bg` `--surface` `--surface2`
- 테두리: `--border` `--border2`
- 글자: `--text` `--text2` `--text3`
- 상태(등급): `--위험-c/bg/bd` `--주의-c/bg/bd` `--안전-c/bg/bd`
- 폰트: `--font` (Apple SD Gothic Neo → Malgun Gothic → Noto Sans KR)
- 모서리: `--r`(6px) `--r-lg`(10px)
- 사이드바 폭: `--sw`(216px)

## ID 네이밍 규칙 (app.js / index.html)
HTML 요소 ID 접두사로 어떤 영역인지 빠르게 식별 가능:
- `k-` 대시보드 KPI 카드 (예: `k-acc-viol`, `k-위험-n`)
- `f-` 대시보드 상단 필터 (예: `f-brand`, `f-grade`)
- `lf-` 모니터링 리스트 필터 (예: `lf-div`, `lf-cat`)
- `p-` 데이터 입력 폼 (예: `p-title`, `p-grade`)
- `m-` 수정 모달 (예: `m-title`, `m-grade`)
- `mo-` 모달 공통 (예: `mo-ov` 오버레이)
- `bs-` `bc-` 브랜드 카드
- `mx-` 매트릭스 테이블

## Supabase 테이블
- `divisions` 계열사 (sort_order 정렬)
- `brands` 브랜드 (`division_id` FK)
- `risk_categories` 8대 리스크 대분류 (sort_order 정렬)
- `risk_subcategories` 중분류 (`category_id` FK)
- `risks` 실제 리스크 등록 데이터
  - 컬럼: registered_at, title, status, grade(위험/주의/안전), item_state(모니터링/위반/완료), note, violation_count, monitoring_count, division_id, brand_id, category_id, subcategory_id

## 보고서 다운로드 (2026-05-28 구현)
- `downloadPPT()`가 외식BG PPT 양식을 그룹 시스템용으로 변환해 생성
- 슬라이드 구성: 표지 → 그룹 KPI → 계열사×8대 매트릭스(연누적/전월) → 카테고리별 상세(전월, 8장) → 영역별 요약 카드 → 계열사별 영역 매트릭스
- '위반' 정의: `item_state IN ('위반','완료')` 일관 적용
- 색상: `--navy`(`#1A2744`) + `--red`(`#C8102E`) 톤
- 보고서 모달 라디오에서 특정 계열사 선택 시 해당 계열사 데이터만으로 생성됨

## 알려진 이슈
- 사용 안 되는 함수 `dlBlob()` 정의됨 (제거해도 무방, 다른 용도 필요 시 활용)

## 수정 작업 시 절약 팁
- 디자인만 → `style.css`만 읽기
- 동작만 → `app.js`만 읽기
- HTML 구조만 → `index.html`만 읽기
- 로그인 화면 수정 → `login.html`만 (자체 완결)
- 사용자가 "어디"를 짚어주면 grep 단계 생략 가능 (캡처도 환영)
- 큰 변경 전에는 Git 커밋으로 복귀점 만들기 (별도 백업 파일 불필요)

## 작업 시 사용자 선호
- 비개발자임을 전제로, 결과·위험·복구 방법을 명확히 안내
- 큰 위험이 있는 작업은 백업 또는 Git 커밋 후 진행
- 빈 규칙 등 정리는 환영 (단, 동작 깨지지 않는 선에서)
