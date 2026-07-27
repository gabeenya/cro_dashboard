-- 이 프로젝트(cro_dashboard-1)의 Supabase SQL Editor에서 실행
-- '영역별 특이사항'에 영역(대분류) 태그를 달 수 있게 컬럼 추가.
-- 기존에 저장된 특이사항은 category_id가 비어있는(NULL, "미지정") 상태로 남아있으며,
-- 대시보드 화면의 "수정" 버튼을 눌러 영역을 지정해줄 수 있다.

alter table public.area_notes add column if not exists category_id bigint references public.risk_categories(id);
