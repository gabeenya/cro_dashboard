-- ════════════════════════════════════════════════════════════
-- 2026-07-06 부실채권 금액 컬럼 추가
--
-- 목적: 부실채권 위반유형이 '미입금' 또는 '2개월 초과 미입금'일 때
--       금액을 기록해 등급 산정(D등급 조건)과 회수금액 KPI 계산에 사용한다.
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣고 [Run]
-- 안전성: "있으면 추가"(idempotent)라 여러 번 실행해도 됩니다.
-- ════════════════════════════════════════════════════════════

alter table public.risks
  add column if not exists amount bigint;

comment on column public.risks.amount is '부실채권 금액(원). 위반유형이 미입금/2개월 초과 미입금일 때만 사용.';
