-- ════════════════════════════════════════════════════════════
-- 2026-06-01 보안 강화: 전체 테이블 RLS(행 수준 보안) 정책 정비
--
-- 목적: 페이지에 노출된 anon(공개) 키로 데이터베이스를 직접 호출해도
--       허가된 행 외에는 읽기·쓰기가 불가능하도록 차단한다.
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣고 [Run]
-- 안전성: 모두 "있으면 교체"(idempotent)라 여러 번 실행해도 됩니다.
--         단, 한 번에 전체를 실행하세요(부분 실행 시 정책이 어긋날 수 있음).
--
-- 사전 점검: 관리자 계정(gabeenya@gmail.com)의 profiles.approved = true 인지 확인.
--            (아래 9번 확인용 쿼리로 점검 가능)
-- ════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────
-- 0. 공통 판별 함수 (관리자 / 승인회원)
--    - is_admin()    : 로그인 토큰의 이메일이 관리자와 같은지
--    - is_approved() : 본인 profiles 행의 approved = true 인지
-- ──────────────────────────────────────────────
create or replace function public.is_admin()
  returns boolean
  language sql stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'gabeenya@gmail.com', false)
$$;

create or replace function public.is_approved()
  returns boolean
  language sql stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true
  )
$$;


-- ──────────────────────────────────────────────
-- 1. profiles (회원 개인정보: 이름/사번/이메일/소속)
--    - 읽기 : 본인 행만, 단 관리자는 전체
--    - 가입 : 본인 행만 생성 가능 + 스스로 승인 불가(approved=false 강제)
--    - 수정 : 관리자만 (승인/해제)
--    - 삭제 : 관리자만
-- ──────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using ( id = auth.uid() or public.is_admin() );

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check ( id = auth.uid() and approved = false );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using ( public.is_admin() );


-- ──────────────────────────────────────────────
-- 2. risks (실제 리스크 데이터)
--    - 승인된 회원(또는 관리자)만 읽기·쓰기 가능
-- ──────────────────────────────────────────────
alter table public.risks enable row level security;

drop policy if exists "risks_select"  on public.risks;
drop policy if exists "risks_insert"  on public.risks;
drop policy if exists "risks_update"  on public.risks;
drop policy if exists "risks_delete"  on public.risks;

create policy "risks_select" on public.risks
  for select to authenticated
  using ( public.is_approved() or public.is_admin() );

create policy "risks_insert" on public.risks
  for insert to authenticated
  with check ( public.is_approved() or public.is_admin() );

create policy "risks_update" on public.risks
  for update to authenticated
  using ( public.is_approved() or public.is_admin() )
  with check ( public.is_approved() or public.is_admin() );

create policy "risks_delete" on public.risks
  for delete to authenticated
  using ( public.is_approved() or public.is_admin() );


-- ──────────────────────────────────────────────
-- 3. 기준(마스터) 테이블: divisions / brands /
--    risk_categories / risk_subcategories / stores
--    - 읽기 : 승인된 회원(또는 관리자)
--    - 쓰기 : 관리자만 (마스터 데이터 변경은 관리자/SQL로만)
-- ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'divisions','brands','risk_categories','risk_subcategories','stores'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%s_select" on public.%I;', t, t);
    execute format($f$
      create policy "%s_select" on public.%I
        for select to authenticated
        using ( public.is_approved() or public.is_admin() );
    $f$, t, t);

    execute format('drop policy if exists "%s_write_admin" on public.%I;', t, t);
    execute format($f$
      create policy "%s_write_admin" on public.%I
        for all to authenticated
        using ( public.is_admin() )
        with check ( public.is_admin() );
    $f$, t, t);
  end loop;
end $$;

-- 이전 마이그레이션에서 만든 느슨한 stores 읽기 정책 제거(있으면)
drop policy if exists "stores_read_authenticated" on public.stores;


-- ──────────────────────────────────────────────
-- 9. (확인용) 적용 결과 점검 쿼리 — 실행해서 눈으로 확인하세요
-- ──────────────────────────────────────────────
-- (a) 관리자 승인 여부
--   select email, approved from public.profiles where email = 'gabeenya@gmail.com';

-- (b) RLS 켜짐 여부 (rowsecurity 가 모두 true 여야 함)
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname='public'
--     and tablename in ('profiles','risks','divisions','brands',
--                       'risk_categories','risk_subcategories','stores')
--   order by tablename;

-- (c) 테이블별 정책 목록
--   select tablename, policyname, cmd
--   from pg_policies where schemaname='public' order by tablename, policyname;


-- ──────────────────────────────────────────────
-- (참고) 되돌리기(롤백)가 필요하면, 위에서 만든 정책명을
--   drop policy if exists "정책명" on public.테이블; 로 제거하면 됩니다.
--   단, RLS를 끄면(disable) 데이터가 다시 공개되니 권장하지 않습니다.
-- ════════════════════════════════════════════════════════════
