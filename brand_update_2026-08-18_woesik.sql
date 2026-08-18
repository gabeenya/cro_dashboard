-- 브랜드 삭제 (2026-08-18) — 외식
-- '본부' / 'CK' / '기타' 3개 브랜드 삭제
-- 삭제 방식: 기존 리스크 데이터는 계열사(외식)에 남기고(brand_id=NULL) 브랜드만 삭제
--
-- ⚠️ 주의: '기타'는 ingest-records(외식BG 자동연동 함수)에서 브랜드명이 매칭 안 될 때
--   대신 넣는 예비값(FALLBACK_BRAND)으로 쓰이고 있음. 이 브랜드를 지우면 앞으로
--   외식BG에서 우리 쪽에 없는 브랜드명이 넘어올 때 자동연동이 500 에러로 실패함
--   (사용자에게 안내 후 승인받고 진행하는 것임 — 별도 조치 필요하면 이후에 안내).
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run

-- 0) 확인용 (실행 전 현재 목록 + 연결된 리스크 건수)
select b.name as 브랜드, b.sort_order,
  (select count(*) from risks r where r.brand_id = b.id) as 연결건수
from brands b join divisions d on d.id = b.division_id
where d.name = '외식'
order by b.sort_order;

-- 1) 연결된 리스크는 브랜드만 해제(계열사 데이터는 유지)
update risks set brand_id = null
where brand_id in (
  select b.id from brands b join divisions d on d.id = b.division_id
  where d.name = '외식' and b.name in ('본부', 'CK', '기타')
);

-- 2) 브랜드 삭제
delete from brands b
using divisions d
where d.id = b.division_id and d.name = '외식' and b.name in ('본부', 'CK', '기타');

-- 3) 결과 확인 (0번과 비교 — '본부'/'CK'/'기타' 3개가 빠져 있어야 함)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '외식'
order by b.sort_order;
