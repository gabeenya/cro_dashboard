-- ════════════════════════════════════════════════════════════
-- 2026-05-29 마이그레이션: 유통 브랜드 갱신 + 매장(소분류) 추가
-- 실행 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣고 Run
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- Task 3: 유통 브랜드 5종 추가 (중복 시 스킵)
-- 기존 브랜드는 보존됨 (위반 데이터의 FK 충돌 방지)
-- 기존 브랜드 삭제하려면 Supabase Studio에서 brands 테이블 직접 정리
-- ──────────────────────────────────────────────
INSERT INTO brands (name, division_id, sort_order)
SELECT b.name, d.id, b.sort_order
FROM (VALUES
  ('리테일',   1),
  ('킴스',     2),
  ('팜앤푸드', 3),
  ('글로벌',   4),
  ('기타',     5)
) AS b(name, sort_order)
CROSS JOIN (SELECT id FROM divisions WHERE name = '유통') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM brands WHERE name = b.name AND division_id = d.id
);

-- ──────────────────────────────────────────────
-- Task 4: 매장 테이블 신규 + risks.store_id 추가
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stores_division ON stores(division_id);

ALTER TABLE risks ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);

-- 유통 매장 데이터 삽입 (중복 시 스킵)
INSERT INTO stores (name, division_id, sort_order)
SELECT s.name, d.id, s.ord
FROM (VALUES
  ('뉴코아 강남점',    1),
  ('NC 강서점',        2),
  ('NC 신구로점',      3),
  ('NC 불광점',        4),
  ('NC 송파점',        5),
  ('2001 중계점',      6),
  ('팩토리 천호점',    7),
  ('NC 이스트폴점',    8),
  ('뉴코아 평촌점',    9),
  ('NC 야탑점',        10),
  ('뉴코아 동수원점',  11),
  ('뉴코아 산본점',    12),
  ('뉴코아 인천점',    13),
  ('뉴코아 부천점',    14),
  ('뉴코아 평택점',    15),
  ('뉴코아 일산점',    16),
  ('팩토리 광명점',    17),
  ('NC 고잔점',        18),
  ('NC 수원터미널점',  19),
  ('2001 분당점',      20),
  ('2001 안양점',      21),
  ('2001 부평점',      22),
  ('NC 대전유성점',    23),
  ('NC 중앙로역점',    24),
  ('NC 청주점',        25),
  ('NC 광주역점',      26),
  ('NC 충장점',        27),
  ('NC 전주점',        28),
  ('NC 순천점',        29),
  ('NC 엑스코점',      30),
  ('NC 경산점',        31),
  ('NC 부산대점',      32),
  ('NC 해운대점',      33),
  ('뉴코아 괴정점',    34),
  ('뉴코아 덕천점',    35),
  ('뉴코아 창원점',    36),
  ('뉴코아 울산점',    37),
  ('팩토리 울산성남점',38),
  ('동아쇼핑점',       39),
  ('동아수성점',       40),
  ('동아구미점',       41),
  ('동아강북점',       42),
  ('NC 포항점',        43)
) AS s(name, ord)
CROSS JOIN (SELECT id FROM divisions WHERE name = '유통') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM stores WHERE name = s.name AND division_id = d.id
);

-- ──────────────────────────────────────────────
-- RLS 정책: stores 테이블 (인증된 사용자 읽기 가능)
-- ──────────────────────────────────────────────
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stores_read_authenticated" ON stores;
CREATE POLICY "stores_read_authenticated" ON stores
  FOR SELECT
  TO authenticated
  USING (true);

-- 관리자 전용 쓰기 정책 (필요 시 활성화)
-- DROP POLICY IF EXISTS "stores_write_admin" ON stores;
-- CREATE POLICY "stores_write_admin" ON stores
--   FOR ALL TO authenticated
--   USING (auth.jwt() ->> 'email' = 'gabeenya@gmail.com')
--   WITH CHECK (auth.jwt() ->> 'email' = 'gabeenya@gmail.com');
