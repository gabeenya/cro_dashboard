-- ════════════════════════════════════════════════════════════
-- 2026-07-06 감사 영역 입력값 일괄 상태 변경
--
-- 목적: 감사(risk_categories.name='감사') 카테고리의 기존 입력 건을 전부
--       item_state='조치완료'로 일괄 변경한다. (요청: "감사 영역 입력값들을
--       일단은 일괄해서 다 '조치완료' 상태로 바꿔줘")
--
-- 주의: 이 스크립트는 되돌릴 수 없는 데이터 변경입니다(적발 상태였던 건도
--       전부 조치완료로 바뀜). 실행 전 몇 건이 바뀌는지 먼저 아래 SELECT로
--       확인해보는 것을 권장합니다.
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 전체 붙여넣고 [Run]
-- ════════════════════════════════════════════════════════════

-- 1) 사전 확인 (실행 전 몇 건이 바뀔지 확인하고 싶다면 먼저 이것만 실행)
-- select id, title, item_state, registered_at
--   from public.risks
--   where category_id = (select id from public.risk_categories where name = '감사');

-- 2) 일괄 변경
update public.risks
set item_state = '조치완료'
where category_id = (select id from public.risk_categories where name = '감사');
