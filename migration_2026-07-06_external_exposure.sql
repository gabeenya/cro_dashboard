-- ════════════════════════════════════════════════════════════
-- 2026-07-06 외부노출 여부 컬럼 추가
--
-- 목적: 데이터 입력 시 "외부노출 여부" 체크박스 값을 저장. 컴플라이언스
--       분류(불법파견/공정거래/영업비밀/IP) 영역에서 외부노출 1건 이상이면
--       F등급으로 산정하는 데 사용된다.
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 전체 붙여넣고 [Run]
-- ════════════════════════════════════════════════════════════

alter table public.risks
  add column if not exists external_exposure boolean not null default false;

comment on column public.risks.external_exposure is '외부노출 여부 — 컴플라이언스 분류(불법파견/공정거래/영업비밀/IP) F등급 산정에 사용';
