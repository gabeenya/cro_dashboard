-- 2026-07-27 마이그레이션: 쥬얼리 브랜드 추가 (로이드, OST)
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- 0) 확인용 (실행 전 현재 목록)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '쥬얼리'
order by b.sort_order;

-- 1) 로이드, OST 추가 (중복 시 스킵, 정렬순서는 기존 마지막 다음부터 이어서)
insert into brands (division_id, name, sort_order)
select d.id, v.name, (select coalesce(max(b2.sort_order), 0) from brands b2 where b2.division_id = d.id) + v.ord
from divisions d
cross join (values
  ('로이드', 1),
  ('OST', 2)
) as v(name, ord)
where d.name = '쥬얼리'
  and not exists (
    select 1 from brands b where b.division_id = d.id and b.name = v.name
  );

-- 2) 결과 확인 (0번과 비교 — 로이드/OST가 추가되어 있어야 함)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '쥬얼리'
order by b.sort_order;
