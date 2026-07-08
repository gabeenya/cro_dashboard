-- IP 영역 중분류 추가 (2026-07-08)
-- IP 대분류 산하에 '침해예방','권리보호' 중분류 추가 (기존 정렬 뒤에 붙임)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- ───────────────────────────────────────────────
-- 0) 확인용 (실행 전 IP 중분류 현재 목록)
select s.name as 중분류, s.sort_order
from risk_subcategories s join risk_categories c on c.id = s.category_id
where c.name = 'IP'
order by s.sort_order;

-- ───────────────────────────────────────────────
-- 1) 중분류 추가
insert into risk_subcategories (category_id, name, sort_order)
select c.id, v.name,
       coalesce((select max(sort_order) from risk_subcategories s where s.category_id = c.id), 0)
         + v.ord
from risk_categories c
cross join (values ('침해예방', 1), ('권리보호', 2)) as v(name, ord)
where c.name = 'IP';

-- ───────────────────────────────────────────────
-- 2) 결과 확인
select s.name as 중분류, s.sort_order
from risk_subcategories s join risk_categories c on c.id = s.category_id
where c.name = 'IP'
order by s.sort_order;
