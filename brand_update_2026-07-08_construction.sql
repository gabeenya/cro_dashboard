-- 브랜드 수정 (2026-07-08) — 건설
-- 현재: 건설(1), 이서비스(2), 기타(3) 3개뿐
-- 목표: 본부/시행/운영/시공/북가좌/수원남문/인천신흥/천안성정/대전문화/대전봉명/대구동문/설악비치/기타 13개
--   - '이서비스' 삭제 (데이터는 계열사에 남기고 brand_id만 null 처리)
--   - '건설' → '본부' 로 이름 변경(기존 브랜드 재사용, sort_order=1)
--   - 나머지 11개(시행~설악비치) 신규 추가
--   - '기타'는 유지하되 목록 맨 뒤로(sort_order=13)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- ───────────────────────────────────────────────
-- 0) 확인용 (실행 전 현재 목록)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '건설'
order by b.sort_order;

-- ───────────────────────────────────────────────
-- 1) '이서비스' 삭제 — 데이터는 계열사에 남기고 브랜드만 제거
update risks set brand_id = null
where brand_id in (
  select b.id from brands b join divisions d on d.id = b.division_id
  where d.name = '건설' and b.name = '이서비스'
);
delete from brands b
using divisions d
where d.id = b.division_id and d.name = '건설' and b.name = '이서비스';

-- 2) '건설' → '본부' 이름 변경 + 정렬순서 1
update brands b set name = '본부', sort_order = 1
from divisions d
where d.id = b.division_id and d.name = '건설' and b.name = '건설';

-- 3) 신규 브랜드 11개 추가 (정렬순서 2~12)
insert into brands (division_id, name, sort_order)
select d.id, v.name, v.ord
from divisions d
cross join (values
  ('시행', 2), ('운영', 3), ('시공', 4), ('북가좌', 5), ('수원남문', 6),
  ('인천신흥', 7), ('천안성정', 8), ('대전문화', 9), ('대전봉명', 10),
  ('대구동문', 11), ('설악비치', 12)
) as v(name, ord)
where d.name = '건설';

-- 4) '기타'를 목록 맨 뒤로 (정렬순서 13)
update brands b set sort_order = 13
from divisions d
where d.id = b.division_id and d.name = '건설' and b.name = '기타';

-- ───────────────────────────────────────────────
-- 5) 결과 확인 (0번과 비교 — 13개, 목표 순서대로 나와야 함)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '건설'
order by b.sort_order;
