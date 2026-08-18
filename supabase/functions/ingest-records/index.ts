// ingest-records — 다른 사이트(records 테이블)의 변경을 이 대시보드의 risks로 단방향 동기화
// ─────────────────────────────────────────────────────────────────────────────
// 흐름: 상대 Supabase의 Database Webhook이 records 테이블에 INSERT/UPDATE/DELETE가
//       일어날 때마다 이 함수를 호출 → 규칙대로 변환해 이 프로젝트의 risks에 반영.
//
// 인증: 사용자 로그인(JWT)이 아니라 "공유 비밀키"로 확인한다.
//   상대 Webhook 설정에서 헤더  x-ingest-secret: <비밀키>  를 보내고,
//   이 함수는 환경변수 INGEST_SECRET 과 같은지 비교한다. (배포 시 --no-verify-jwt 필요)
//
// 쓰기: 로그인 사용자가 없으므로 SERVICE_ROLE 키로 RLS를 우회해 직접 기록한다.
//
// 필요한 Edge Functions Secrets:
//   - INGEST_SECRET                (아무도 모를 긴 임의 문자열. 상대 Webhook 헤더와 동일하게)
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  는 런타임에 자동 주입됨
//
// 변환 규칙(2026-06-08 확정, 2026-07-06 중분류 매핑 + 영업비밀/IP/부실채권/감사/중대재해/외부노출 추가):
//   - type 이 가맹/표시광고/불법파견/영업비밀/IP/부실채권/감사/안전 인 행만 반영. 그 외 type(노무/위생/클레임 등)은 무시.
//   - 카테고리: 가맹→공정거래, 표시광고→공정거래, 불법파견→불법파견, 영업비밀→영업비밀, IP→IP, 부실채권→부실채권, 감사→감사, 안전→중대재해
//   - 중분류: 가맹→공정거래의 '가맹', 표시광고→공정거래의 '표시광고' (risk_subcategories에서 이름으로 조회, 없으면 null로 저장)
//   - 계열사: 무조건 '외식'
//   - 브랜드: records.brand 이름 그대로 매칭. 없으면 '기타'로.
//   - item_state: status 그대로 (완료/모니터링/위반). 단 부실채권(발생/해결)·감사(적발/조치완료)·중대재해(발생/조치완료)는 우리 쪽 상태값에 맞춰 변환(STATE_REMAP).
//   - 건수: 모니터링이면 monitoring_count, 그 외(완료/위반)면 violation_count
//   - 부실채권: subtype을 violation_type으로, bc_amount를 amount로 저장(금액 기준 D/F 등급 판정에 사용됨).
//     외식BG의 subtype 값 '2개월 초과 미입금'은 우리 쪽 이름 '부실채권'으로 치환(BAD_DEBT_SUBTYPE_REMAP,
//     2026-07-08 app.js 쪽에서 위반유형 이름을 '2개월 초과 미입금'→'부실채권'으로 바꿨는데 이 함수는
//     그때 안 맞춰져 있었음 — 그대로 두면 금액 기준 D/F 판정(calcCategoryGrade)이 조용히 안 걸림).
//     '미입금'은 그대로 통과.
//   - 중대재해: subtype을 violation_type으로 그대로 저장('중대재해 발생'이면 F등급 조건에 걸림)
//   - (2026-08-18 추가) 영업비밀/공정거래/불법파견/감사도 subtype을 violation_type으로 저장.
//     예전엔 부실채권·중대재해만 violation_type을 채우고 나머지는 전부 null로 저장하고 있었음
//     (title에만 subtype이 들어가고 violation_type엔 안 들어감) — 위반유형별 필터/집계가 이 카테고리들에서
//     항상 비어 보이는 원인이었음. IP는 app.js에 위반유형 목록 자체가 없어서(수동입력도 선택 불가) 계속 null.
//     VIOLATION_TYPE_CATEGORIES 참고.
//   - 감사: jng_type(징계유형, "선택 안함"→null)→discipline_type, jg_name→discipline_name, jg_sent→sentence
//   - 외부노출: exposed(boolean, 전 영역 공통)를 external_exposure로 저장(컴플라이언스 분류 F등급 조건에 사용됨)
//   - registered_at: date,  note: note,  title(필수): subtype
//   - source_id: 상대 record.id (수정/삭제 때 짝을 찾기 위한 꼬리표)
//   - (2026-07-06 밤 변경) 기준월 제외 규칙 제거 — 이제 등록 월과 무관하게 전 기간 동기화(전체 백필 대응)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const DIVISION_NAME = "외식";
const FALLBACK_BRAND = "기타";
const TYPE_TO_CATEGORY: Record<string, string> = {
  "가맹": "공정거래",
  "표시광고": "공정거래",
  "불법파견": "불법파견",
  "영업비밀": "영업비밀",
  "IP": "IP",
  "부실채권": "부실채권",
  "감사": "감사",
  "안전": "중대재해",
};
// 공정거래 대분류 안에서 중분류를 어떤 이름으로 찾을지 (없으면 이 type은 중분류 없이 대분류만)
const TYPE_TO_SUBCATEGORY: Record<string, string | null> = {
  "가맹": "가맹",
  "표시광고": "표시광고",
  "불법파견": null,
  "영업비밀": null,
  "IP": null,
  "부실채권": null,
  "감사": null,
  "안전": null,
};
// 우리 쪽 카테고리별로 상태값 어휘가 다른 경우 변환(예: 부실채권/감사/중대재해는 완료/위반/모니터링 3단계가 아님).
// 매핑에 없는 원본 status 값은 그대로 통과.
const STATE_REMAP: Record<string, Record<string, string>> = {
  "부실채권": { "완료": "해결", "위반": "발생", "모니터링": "발생" },
  "감사": { "완료": "조치완료", "위반": "적발", "모니터링": "적발" },
  "중대재해": { "완료": "조치완료", "위반": "발생", "모니터링": "발생" },
};
// 외식BG의 징계유형(jng_type) 값 → 우리 쪽 discipline_type. "선택 안함"은 미입력으로 처리.
const DISCIPLINE_TYPE_MAP: Record<string, string | null> = {
  "선택 안함": null,
  "금전회수": "금전회수",
  "경징계": "경징계",
  "중징계": "중징계",
  "형사고발": "형사고발",
};
// 외식BG 부실채권 subtype → 우리 쪽 violation_type 이름. 매핑에 없는 값(예: '미입금')은 그대로 통과.
const BAD_DEBT_SUBTYPE_REMAP: Record<string, string> = {
  "2개월 초과 미입금": "부실채권",
};
// subtype을 violation_type으로 저장할 카테고리. IP는 app.js에 위반유형 개념 자체가 없어서 제외(계속 null).
const VIOLATION_TYPE_CATEGORIES = new Set([
  "부실채권", "중대재해", "영업비밀", "공정거래", "불법파견", "감사",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 1) 공유 비밀키 확인
  const secret = req.headers.get("x-ingest-secret") || "";
  const expected = Deno.env.get("INGEST_SECRET") || "";
  if (!expected || secret !== expected) {
    return json({ error: "비밀키가 일치하지 않습니다." }, 401);
  }

  try {
    const payload = await req.json();
    // Supabase Database Webhook 형식: { type, table, schema, record, old_record }
    const event: string = payload.type || "INSERT";
    const rec = payload.record || null;
    const oldRec = payload.old_record || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2) DELETE: 상대에서 지워진 건이면, 우리 쪽 거울(source_id 일치)도 삭제
    if (event === "DELETE") {
      const srcId = oldRec?.id != null ? String(oldRec.id) : null;
      if (!srcId) return json({ ok: true, action: "skip", reason: "삭제할 id 없음" });
      const { error } = await admin.from("risks").delete().eq("source_id", srcId);
      if (error) return json({ error: `삭제 실패: ${error.message}` }, 500);
      return json({ ok: true, action: "deleted", source_id: srcId });
    }

    // 여기부터 INSERT / UPDATE
    if (!rec) return json({ error: "record 가 비어 있습니다." }, 400);
    const srcId = rec.id != null ? String(rec.id) : null;
    if (!srcId) return json({ error: "record.id 가 없습니다." }, 400);

    // (2026-07-06 밤 제거) 기준월 이전 제외 차단을 없앰 — 이제 전체 기간(3~4월 포함) 백필을 위해
    // 등록 월과 무관하게 전부 동기화한다.

    // 3) 반영 대상 type 인지 확인. 아니면 (수정으로 type이 바뀐 경우 대비) 기존 거울 제거 후 건너뜀
    const category = TYPE_TO_CATEGORY[String(rec.type ?? "").trim()];
    if (!category) {
      await admin.from("risks").delete().eq("source_id", srcId);
      return json({ ok: true, action: "skip", reason: `대상 아닌 type: ${rec.type}` });
    }

    // 4) 이름 → id 변환에 필요한 기준표 읽기
    const [{ data: divs }, { data: cats }, { data: brs }, { data: subs }] = await Promise.all([
      admin.from("divisions").select("id,name").eq("name", DIVISION_NAME),
      admin.from("risk_categories").select("id,name"),
      admin.from("brands").select("id,name,division_id"),
      admin.from("risk_subcategories").select("id,name,category_id"),
    ]);

    const divId = divs?.[0]?.id;
    if (!divId) return json({ error: `계열사 '${DIVISION_NAME}' 를 찾을 수 없습니다.` }, 500);

    const catId = cats?.find((c) => c.name === category)?.id;
    if (!catId) return json({ error: `카테고리 '${category}' 를 찾을 수 없습니다.` }, 500);

    // 중분류: 대분류(catId) 안에서 이름으로 매칭. 매핑이 없거나 못 찾으면 null(대분류만).
    const subcatName = TYPE_TO_SUBCATEGORY[String(rec.type ?? "").trim()] ?? null;
    const subcatId = subcatName
      ? (subs || []).find((s) => s.category_id === catId && s.name === subcatName)?.id ?? null
      : null;

    // 외식 계열사 산하 브랜드 중 이름 매칭. 없으면 '기타'.
    const divBrands = (brs || []).filter((b) => b.division_id === divId);
    const brandName = String(rec.brand ?? "").trim();
    let brandId = divBrands.find((b) => b.name === brandName)?.id;
    let brandNote = brandName;
    if (!brandId) {
      brandId = divBrands.find((b) => b.name === FALLBACK_BRAND)?.id;
      brandNote = `${brandName} → 기타(미매칭)`;
    }
    if (!brandId) return json({ error: `브랜드 매칭 실패(기타도 없음): ${brandName}` }, 500);

    // 5) 값 만들기 (기존 입력폼과 동일 규칙)
    // 외식BG가 상태값 뒤에 "(처리중)" 같은 부연설명을 붙이는 경우가 있어(예: "위반(처리중)"),
    // 괄호 설명은 잘라내고 기본 단어(완료/모니터링/위반)만 취한다. 안 그러면 우리 쪽
    // item_state 체크 제약조건에 없는 값이 되어 INSERT가 조용히 실패한다.
    const rawState = String(rec.status ?? "").trim().replace(/\s*\(.*\)\s*$/, ""); // 완료 / 모니터링 / 위반
    const state = STATE_REMAP[category]?.[rawState] ?? rawState;
    const cnt = rec.count != null ? Number(rec.count) : null;
    const isMon = state === "모니터링";
    // 부실채권: subtype을 위반유형으로(단 BAD_DEBT_SUBTYPE_REMAP으로 이름 치환), bc_amount를 금액으로 사용.
    // 중대재해/영업비밀/공정거래/불법파견/감사: subtype을 위반유형으로 그대로 저장.
    // IP는 위반유형 개념이 없어 계속 null(VIOLATION_TYPE_CATEGORIES 참고).
    const rawSubtype = String(rec.subtype ?? "").trim();
    const violationType = !VIOLATION_TYPE_CATEGORIES.has(category)
      ? null
      : category === "부실채권"
      ? (BAD_DEBT_SUBTYPE_REMAP[rawSubtype] || rawSubtype || null)
      : (rawSubtype || null);
    const amount = category === "부실채권" && rec.bc_amount != null ? Number(rec.bc_amount) : null;
    // 감사: 징계유형/징계자명/양형
    const disciplineType = category === "감사"
      ? (DISCIPLINE_TYPE_MAP[String(rec.jng_type ?? "").trim()] ?? null)
      : null;
    const disciplineName = category === "감사" ? (String(rec.jg_name ?? "").trim() || null) : null;
    const sentence = category === "감사" ? (String(rec.jg_sent ?? "").trim() || null) : null;
    // 외부노출 여부: 모든 영역 공통(exposed 컬럼 boolean 그대로)
    const externalExposure = rec.exposed === true;
    // 상대(records) 쪽 수정시각. 대량 백필처럼 웹훅이 짧은 시간에 몰려 도착하면
    // 처리 속도 차이로 먼저 일어난 일이 나중에 저장돼(순서 역전) 최신 값이 옛날 값에
    // 덮어써질 수 있다. 이를 막기 위해 상대 records.updated_at을 그대로 들고 와
    // 아래 7)에서 "내가 이미 가진 것보다 더 최신인 경우에만" 반영한다.
    // records에 updated_at이 아직 없으면(마이그레이션 전) null → 항상 반영(기존 동작 유지).
    const sourceUpdatedAt = rec.updated_at ? new Date(rec.updated_at) : null;
    const row = {
      division_id: divId,
      brand_id: brandId,
      category_id: catId,
      subcategory_id: subcatId,
      store_id: null,
      grade: "안전", // 화면(loadAll)에서 규칙으로 재계산됨
      item_state: state,
      registered_at: rec.date || null,
      title: String(rec.subtype ?? "").trim() || "(제목없음)",
      status: null,
      note: rec.note ?? null,
      violation_count: isMon ? null : cnt,
      monitoring_count: isMon ? cnt : null,
      violation_type: violationType,
      amount: amount,
      discipline_type: disciplineType,
      discipline_name: disciplineName,
      sentence: sentence,
      external_exposure: externalExposure,
      source_id: srcId,
      source_updated_at: sourceUpdatedAt ? sourceUpdatedAt.toISOString() : null,
    };

    // 6) 이미 받아둔 건(source_id 동일)이면 수정, 아니면 새로 추가
    const { data: existing } = await admin
      .from("risks").select("id, source_updated_at").eq("source_id", srcId).maybeSingle();

    // 7) 순서 역전 방지: 이미 가진 기록이 이번 이벤트보다 더 최신이면(둘 다 시각 정보가 있을 때만) 무시.
    //    시각 정보가 없는 쪽(마이그레이션 전 데이터, 또는 옛 이벤트)은 비교 없이 항상 반영.
    if (existing?.source_updated_at && sourceUpdatedAt) {
      const existingUpdatedAt = new Date(existing.source_updated_at);
      if (sourceUpdatedAt < existingUpdatedAt) {
        return json({
          ok: true,
          action: "skipped_stale",
          source_id: srcId,
          reason: `더 최신 데이터가 이미 반영되어 있어 무시함 (수신: ${sourceUpdatedAt.toISOString()}, 기존: ${existingUpdatedAt.toISOString()})`,
        });
      }
    }

    if (existing?.id) {
      const { error } = await admin.from("risks").update(row).eq("id", existing.id);
      if (error) return json({ error: `수정 실패: ${error.message}` }, 500);
      return json({ ok: true, action: "updated", source_id: srcId, brand: brandNote });
    } else {
      const { error } = await admin.from("risks").insert(row);
      if (error) return json({ error: `추가 실패: ${error.message}` }, 500);
      return json({ ok: true, action: "inserted", source_id: srcId, brand: brandNote });
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
