-- ════════════════════════════════════════════════════════════
-- 2026-07-06 공정거래 중분류(가맹/표시광고) 확인 + 없으면 생성
--
-- 목적: 외식BG 사이트에서 넘어오는 가맹/표시광고 값을 공정거래 대분류 +
--       가맹/표시광고 중분류로 연동하기 위한 사전 준비. 이미 있으면 그대로
--       두고, 없으면 새로 만든다(idempotent — 여러 번 실행해도 안전).
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 전체 붙여넣고 [Run]
-- ════════════════════════════════════════════════════════════

-- 1) 확인: 공정거래 카테고리 아래 현재 중분류 목록
select rs.id, rs.name, rs.category_id
from public.risk_subcategories rs
join public.risk_categories rc on rc.id = rs.category_id
where rc.name = '공정거래';

-- 2) 없으면 생성 ('가맹', '표시광고' 중 없는 것만 추가)
insert into public.risk_subcategories (category_id, name)
select (select id from public.risk_categories where name = '공정거래'), v.name
from (values ('가맹'), ('표시광고')) as v(name)
where not exists (
  select 1 from public.risk_subcategories rs
  where rs.category_id = (select id from public.risk_categories where name = '공정거래')
    and rs.name = v.name
);

-- 3) 재확인
select rs.id, rs.name, rs.category_id
from public.risk_subcategories rs
join public.risk_categories rc on rc.id = rs.category_id
where rc.name = '공정거래';
