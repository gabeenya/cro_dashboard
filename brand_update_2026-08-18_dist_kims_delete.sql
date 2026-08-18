-- 브랜드 삭제 (2026-08-18) — 유통 '킴스'
-- 요청: 킴스 브랜드와 연결된 리스크 데이터까지 완전히 삭제(화면에서도 전혀 안 보이게)
-- ⚠️ 주의: 이전 브랜드 삭제(외식 본부/CK/기타 등)는 리스크 데이터를 보존하고 brand_id만
--   null 처리했지만, 이번은 요청에 따라 리스크 데이터 자체를 삭제합니다. 실행하면 되돌릴 수
--   없으니, 0번 결과에 지우면 안 되는 데이터가 있는지 먼저 확인하세요.
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- 0) 확인용 (실행 전 연결된 리스크/특이사항 건수 — 이 숫자만큼 영구 삭제됨)
select b.id as 브랜드id, b.name as 브랜드,
  (select count(*) from risks r where r.brand_id = b.id) as 연결된_리스크건수,
  (select count(*) from area_notes n where n.brand_id = b.id) as 연결된_특이사항건수
from brands b join divisions d on d.id = b.division_id
where d.name = '유통' and b.name = '킴스';

-- 1) 킴스에 연결된 영역별 특이사항 삭제
delete from area_notes n
using brands b, divisions d
where n.brand_id = b.id and b.division_id = d.id
  and d.name = '유통' and b.name = '킴스';

-- 2) 킴스에 연결된 리스크 데이터 삭제
delete from risks r
using brands b, divisions d
where r.brand_id = b.id and b.division_id = d.id
  and d.name = '유통' and b.name = '킴스';

-- 3) 킴스 브랜드 삭제
delete from brands b
using divisions d
where d.id = b.division_id and d.name = '유통' and b.name = '킴스';

-- 4) 결과 확인 (0번 목록에서 '킴스'가 없어야 함)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '유통'
order by b.sort_order;
