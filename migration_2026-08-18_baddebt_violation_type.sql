-- 2026-08-18 마이그레이션: 외식BG 실시간 연동으로 이미 들어온 부실채권 건 중
-- violation_type이 옛 이름 '2개월 초과 미입금'으로 저장된 것을 '부실채권'으로 정정
-- 배경: app.js는 2026-07-08에 위반유형 이름을 '2개월 초과 미입금' → '부실채권'으로 바꿨는데,
--       ingest-records(외식BG 연동 Edge Function)는 그때 안 맞춰져 있었음(2026-08-18에 수정).
--       그 사이 동기화된 건들은 옛 이름 그대로 남아있어서, 금액 기준 D/F 등급 판정
--       (calcCategoryGrade의 violation_type==='부실채권' 조건)에 안 걸리고 있었음.
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- 0) 확인용 (실행 전 대상 건수)
select count(*) as 대상건수
from risks r
join risk_categories c on c.id = r.category_id
where c.name = '부실채권'
  and r.violation_type = '2개월 초과 미입금';

-- 1) 정정
update risks r
set violation_type = '부실채권'
from risk_categories c
where c.id = r.category_id
  and c.name = '부실채권'
  and r.violation_type = '2개월 초과 미입금';

-- 2) 결과 확인 (0번과 비교 — 대상건수가 0이 되어야 함)
select count(*) as 남은건수
from risks r
join risk_categories c on c.id = r.category_id
where c.name = '부실채권'
  and r.violation_type = '2개월 초과 미입금';
