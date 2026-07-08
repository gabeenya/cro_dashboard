-- ════════════════════════════════════════════════════════════
-- 2026-07-08 감사 중분류에 "부정적발" 추가
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 전체 붙여넣고 [Run]
-- 여러 번 실행해도 안전(이미 있으면 다시 추가하지 않음).
-- ════════════════════════════════════════════════════════════

-- 1) 실행 전 확인: 감사 카테고리 아래 현재 중분류 목록
select rs.id, rs.name, rs.category_id
from public.risk_subcategories rs
join public.risk_categories rc on rc.id = rs.category_id
where rc.name = '감사';

-- 2) 없으면 생성
insert into public.risk_subcategories (category_id, name)
select (select id from public.risk_categories where name = '감사'), '부정적발'
where not exists (
  select 1 from public.risk_subcategories rs
  where rs.category_id = (select id from public.risk_categories where name = '감사')
    and rs.name = '부정적발'
);

-- 3) 실행 후 재확인
select rs.id, rs.name, rs.category_id
from public.risk_subcategories rs
join public.risk_categories rc on rc.id = rs.category_id
where rc.name = '감사';
