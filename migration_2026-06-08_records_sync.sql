-- 다른 사이트(records) 실시간 연동을 위한 준비
-- 2026-06-08
--
-- risks 테이블에 source_id 칸 하나를 추가한다.
--   · 다른 사이트에서 들어온 데이터가 "상대의 몇 번 건"에서 왔는지 표시하는 꼬리표.
--   · 이걸로 상대에서 수정/삭제될 때 우리 쪽 짝을 찾아 같이 고치거나 지운다.
--   · 사람이 손으로 입력한 기존/신규 데이터는 이 칸이 비어(NULL) 있다 — 영향 없음.
--
-- 안전: 기존 데이터와 기능에 영향 없음. 비어있는 칸 하나가 늘 뿐이다.
--       (IF NOT EXISTS 라서 두 번 실행해도 안전)

-- 1) source_id 칸 추가
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS source_id text;

-- 2) 같은 상대 건이 중복으로 두 번 들어오지 않도록, source_id 는 유일하게.
--    (NULL 은 여러 개 허용되므로 손입력 데이터에는 제약이 걸리지 않는다)
CREATE UNIQUE INDEX IF NOT EXISTS risks_source_id_key
  ON public.risks (source_id)
  WHERE source_id IS NOT NULL;
