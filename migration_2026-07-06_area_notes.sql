-- ════════════════════════════════════════════════════════════
-- 2026-07-06 영역별 특이사항 테이블 신규 생성
--
-- 목적: 데이터 입력 화면의 "영역별 특이사항" 입력폼(날짜/브랜드/주요이슈/
--       이슈상세/조치사항)을 저장하는 새 테이블. risks와 별개의 독립 테이블.
--       조치사항 판(감사 KPI 아래) 하단에 표로 노출된다.
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 전체 붙여넣고 [Run]
-- 안전성: "있으면 교체"(idempotent)라 여러 번 실행해도 됩니다.
-- ════════════════════════════════════════════════════════════

create table if not exists public.area_notes (
  id bigint generated always as identity primary key,
  note_date date,
  brand_id bigint references public.brands(id),
  main_issue text,
  issue_detail text,
  action_text text,
  created_at timestamptz not null default now()
);

comment on table public.area_notes is '영역별 특이사항(날짜/브랜드/주요이슈/이슈상세/조치사항) — 데이터 입력 화면에서 작성, 조치사항 판 하단에 노출';

-- RLS: risks 테이블과 동일하게 승인된 회원(또는 관리자)만 읽기·쓰기 가능
alter table public.area_notes enable row level security;

drop policy if exists "area_notes_select" on public.area_notes;
drop policy if exists "area_notes_insert" on public.area_notes;
drop policy if exists "area_notes_update" on public.area_notes;
drop policy if exists "area_notes_delete" on public.area_notes;

create policy "area_notes_select" on public.area_notes
  for select to authenticated
  using ( public.is_approved() or public.is_admin() );

create policy "area_notes_insert" on public.area_notes
  for insert to authenticated
  with check ( public.is_approved() or public.is_admin() );

create policy "area_notes_update" on public.area_notes
  for update to authenticated
  using ( public.is_approved() or public.is_admin() )
  with check ( public.is_approved() or public.is_admin() );

create policy "area_notes_delete" on public.area_notes
  for delete to authenticated
  using ( public.is_approved() or public.is_admin() );
