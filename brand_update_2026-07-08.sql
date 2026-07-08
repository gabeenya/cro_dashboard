-- 브랜드 수정 (2026-07-08)
-- 파크: 기존 15개 브랜드명 전부 KH/KR 접두어 붙여 이름만 변경 (추가/삭제 없음)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → 새 쿼리에 붙여넣고 Run
-- 매핑:
--   여의도 → KH여의도       평창 → KH평창          설악 → KH설악
--   켄트 → KH켄트           설악밸리 → KR설악밸리    설악비치 → KR설악비치
--   가평 → KR가평           충주 → KR충주           경주 → KR경주
--   하동 → KR하동           서귀포 → KR서귀포        중문 → KR제주중문
--   한림 → KR제주한림       남원 → KR남원           본부 → 본부(변경 없음)

-- ───────────────────────────────────────────────
-- 0) 확인용 (실행 전 현재 목록)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '파크'
order by b.sort_order;

-- ───────────────────────────────────────────────
-- 1) 이름 변경
update brands b set name = v.new_name
from divisions d,
     (values
       ('여의도','KH여의도'),
       ('평창','KH평창'),
       ('설악','KH설악'),
       ('켄트','KH켄트'),
       ('설악밸리','KR설악밸리'),
       ('설악비치','KR설악비치'),
       ('가평','KR가평'),
       ('충주','KR충주'),
       ('경주','KR경주'),
       ('하동','KR하동'),
       ('서귀포','KR서귀포'),
       ('중문','KR제주중문'),
       ('한림','KR제주한림'),
       ('남원','KR남원')
     ) as v(old_name, new_name)
where d.id = b.division_id
  and d.name = '파크'
  and b.name = v.old_name;

-- ───────────────────────────────────────────────
-- 2) 결과 확인 (0번과 비교 — 이름만 바뀌고 15개 그대로 남아있어야 함)
select b.name as 브랜드, b.sort_order
from brands b join divisions d on d.id = b.division_id
where d.name = '파크'
order by b.sort_order;
