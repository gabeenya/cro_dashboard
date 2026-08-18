-- 2026-08-18 마이그레이션: 외식BG 실시간 연동으로 이미 들어온 건 중
-- 영업비밀/공정거래/불법파견/감사의 violation_type이 null로 저장된 것을 백필
-- 배경: ingest-records는 그동안 부실채권/중대재해만 violation_type을 채우고
--       나머지 카테고리는 전부 null로 저장했음(2026-08-18에 코드 수정 완료, 이 SQL은
--       그 수정 이전에 이미 동기화되어 있던 과거 건들을 정정하는 용도).
--       title 컬럼에는 원래부터 subtype 값이 그대로 들어가 있으므로(title(필수): subtype),
--       그 값을 violation_type에도 그대로 복사하면 됨.
-- 대상 카테고리: 영업비밀/공정거래/불법파견/감사 (부실채권은 별도 마이그레이션
--   migration_2026-08-18_baddebt_violation_type.sql 에서 처리, IP는 위반유형 개념이 없어 제외)
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- 0) 확인용 (실행 전 대상 건수, 카테고리별)
select c.name as 카테고리, count(*) as 대상건수
from risks r
join risk_categories c on c.id = r.category_id
where c.name in ('영업비밀','공정거래','불법파견','감사')
  and r.source_id is not null
  and r.violation_type is null
group by c.name;

-- 1) 백필
update risks r
set violation_type = r.title
from risk_categories c
where c.id = r.category_id
  and c.name in ('영업비밀','공정거래','불법파견','감사')
  and r.source_id is not null
  and r.violation_type is null;

-- 2) 결과 확인 (0번과 비교 — 전부 0이 되어야 함)
select c.name as 카테고리, count(*) as 남은건수
from risks r
join risk_categories c on c.id = r.category_id
where c.name in ('영업비밀','공정거래','불법파견','감사')
  and r.source_id is not null
  and r.violation_type is null
group by c.name;
