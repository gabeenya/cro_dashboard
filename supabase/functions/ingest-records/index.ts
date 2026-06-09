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
// 변환 규칙(2026-06-08 확정):
//   - type 이 가맹/표시광고/불법파견 인 행만 반영. 그 외 type 은 무시.
//   - 카테고리: 가맹→공정거래, 표시광고→공정거래, 불법파견→불법파견
//   - 계열사: 무조건 '외식'
//   - 브랜드: records.brand 이름 그대로 매칭. 없으면 '기타'로.
//   - item_state: status 그대로 (완료/모니터링/위반)
//   - 건수: 모니터링이면 monitoring_count, 그 외(완료/위반)면 violation_count
//   - registered_at: date,  note: note,  title(필수): subtype
//   - source_id: 상대 record.id (수정/삭제 때 짝을 찾기 위한 꼬리표)
//   - (2026-06-09 추가) 재등장 차단: 등록 월이 2026-05 이전이면 동기화 제외 (아래 CUTOFF_YM)

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
};

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

    // (재등장 차단, 2026-06-09) 등록 월이 기준월(2026-05) 이전이면 동기화하지 않음.
    //   → 이미 삭제한 3~4월 옛 데이터를 원본에서 수정해도 다시 들어오지 않음. 기존 거울이 있으면 제거.
    const CUTOFF_YM = "2026-05";
    const _dm = String(rec.date ?? "").match(/(\d{4})[-./](\d{1,2})/);
    const recYM = _dm ? `${_dm[1]}-${_dm[2].padStart(2, "0")}` : "";
    if (recYM && recYM < CUTOFF_YM) {
      await admin.from("risks").delete().eq("source_id", srcId);
      return json({ ok: true, action: "skip", reason: `기준월(${CUTOFF_YM}) 이전 제외: ${recYM}` });
    }

    // 3) 반영 대상 type 인지 확인. 아니면 (수정으로 type이 바뀐 경우 대비) 기존 거울 제거 후 건너뜀
    const category = TYPE_TO_CATEGORY[String(rec.type ?? "").trim()];
    if (!category) {
      await admin.from("risks").delete().eq("source_id", srcId);
      return json({ ok: true, action: "skip", reason: `대상 아닌 type: ${rec.type}` });
    }

    // 4) 이름 → id 변환에 필요한 기준표 읽기
    const [{ data: divs }, { data: cats }, { data: brs }] = await Promise.all([
      admin.from("divisions").select("id,name").eq("name", DIVISION_NAME),
      admin.from("risk_categories").select("id,name"),
      admin.from("brands").select("id,name,division_id"),
    ]);

    const divId = divs?.[0]?.id;
    if (!divId) return json({ error: `계열사 '${DIVISION_NAME}' 를 찾을 수 없습니다.` }, 500);

    const catId = cats?.find((c) => c.name === category)?.id;
    if (!catId) return json({ error: `카테고리 '${category}' 를 찾을 수 없습니다.` }, 500);

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
    const state = String(rec.status ?? "").trim(); // 완료 / 모니터링 / 위반
    const cnt = rec.count != null ? Number(rec.count) : null;
    const isMon = state === "모니터링";
    const row = {
      division_id: divId,
      brand_id: brandId,
      category_id: catId,
      subcategory_id: null,
      store_id: null,
      grade: "안전", // 화면(loadAll)에서 규칙으로 재계산됨
      item_state: state,
      registered_at: rec.date || null,
      title: String(rec.subtype ?? "").trim() || "(제목없음)",
      status: null,
      note: rec.note ?? null,
      violation_count: isMon ? null : cnt,
      monitoring_count: isMon ? cnt : null,
      source_id: srcId,
    };

    // 6) 이미 받아둔 건(source_id 동일)이면 수정, 아니면 새로 추가
    const { data: existing } = await admin
      .from("risks").select("id").eq("source_id", srcId).maybeSingle();

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
