-- 이 프로젝트(cro_dashboard-1)의 Supabase SQL Editor에서 실행
-- 외식BG 연동 시 "대량 백필처럼 웹훅이 짧은 시간에 몰려 도착하면 처리 순서가 뒤바뀌어
-- 최신 값이 옛날 값에 덮어써지는" 문제를 막기 위한 컬럼 추가.
-- ingest-records 함수가 상대(records) 쪽 수정시각을 여기에 저장해두고,
-- 다음 이벤트가 이 값보다 더 과거면(=순서가 뒤바뀐 낡은 이벤트면) 반영을 건너뛴다.

alter table risks add column if not exists source_updated_at timestamptz;
