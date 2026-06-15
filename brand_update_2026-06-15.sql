-- 브랜드 수정 (2026-06-15)
-- 파크: '해외' 삭제 / '남원','켄트' 추가
-- 패션: '폴더' 삭제 / '본부','온라인' 추가
-- 삭제 방식: 기존 리스크 데이터는 계열사에 남기고(brand_id=NULL) 브랜드만 삭제
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run
-- 주의: 계열사명이 '파크','패션'과 정확히 일치해야 합니다. 아래 0번으로 먼저 확인하세요.

-- ───────────────────────────────────────────────
-- 0) 확인용 (먼저 실행해 계열사명과 현재 브랜드 목록 점검)
select d.name as 계열사, b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name in ('파크','패션')
order by d.name, b.sort_order;

-- ───────────────────────────────────────────────
-- 1) 파크: '남원','켄트' 추가 (기존 정렬 뒤에 붙임)
insert into brands (division_id, name, sort_order)
select d.id, v.name,
       coalesce((select max(sort_order) from brands b where b.division_id = d.id), 0)
         + v.ord
from divisions d
cross join (values ('남원', 1), ('켄트', 2)) as v(name, ord)
where d.name = '파크';

-- 2) 패션: '본부','온라인' 추가
insert into brands (division_id, name, sort_order)
select d.id, v.name,
       coalesce((select max(sort_order) from brands b where b.division_id = d.id), 0)
         + v.ord
from divisions d
cross join (values ('본부', 1), ('온라인', 2)) as v(name, ord)
where d.name = '패션';

-- ───────────────────────────────────────────────
-- 3) 파크: '해외' 삭제 — 데이터는 계열사에 남기고 브랜드만 제거
update risks set brand_id = null
where brand_id in (
  select b.id from brands b join divisions d on d.id = b.division_id
  where d.name = '파크' and b.name = '해외'
);
delete from brands b
using divisions d
where d.id = b.division_id and d.name = '파크' and b.name = '해외';

-- 4) 패션: '폴더' 삭제 — 데이터는 계열사에 남기고 브랜드만 제거
update risks set brand_id = null
where brand_id in (
  select b.id from brands b join divisions d on d.id = b.division_id
  where d.name = '패션' and b.name = '폴더'
);
delete from brands b
using divisions d
where d.id = b.division_id and d.name = '패션' and b.name = '폴더';

-- ───────────────────────────────────────────────
-- 5) 결과 확인 (0번과 비교)
select d.name as 계열사, b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name in ('파크','패션')
order by d.name, b.sort_order;
