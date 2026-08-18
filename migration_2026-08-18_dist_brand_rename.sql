-- ════════════════════════════════════════════════════════════
-- 2026-08-18 마이그레이션: 유통 브랜드 명칭 변경 (팜앤푸드→하이퍼, 글로벌→의류)
-- 실행 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣고 Run
-- 기존 데이터(risks 등)는 brand_id로 연결돼 있어 이름만 바뀌고 값은 그대로 유지됨
-- ════════════════════════════════════════════════════════════

UPDATE brands SET name = '하이퍼'
WHERE name = '팜앤푸드'
  AND division_id = (SELECT id FROM divisions WHERE name = '유통');

UPDATE brands SET name = '의류'
WHERE name = '글로벌'
  AND division_id = (SELECT id FROM divisions WHERE name = '유통');
