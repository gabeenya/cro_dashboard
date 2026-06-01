// ════════════════════════════════════════════════════════════
// Edge Function: delete-user
// 관리자가 가입 요청(또는 회원)을 "거절/삭제"할 때 호출.
// 가입정보(profiles) + 로그인 계정(auth.users)을 함께 삭제 →
// 같은 이메일로 나중에 다시 가입 요청할 수 있게 됨.
//
// 보안: 요청자의 로그인 토큰(JWT)을 검증해 관리자 이메일일 때만 실행.
//       실제 삭제는 서버 전용 service_role 키로 수행(브라우저에 노출 안 됨).
//
// 배포: Supabase Dashboard → Edge Functions → New function → 이름 delete-user
//       → 이 코드 붙여넣고 Deploy.  (SUPABASE_* 환경변수는 자동 제공됨)
// ════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "gabeenya@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST만 허용" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) 요청자(관리자) 검증
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "인증이 필요합니다." }, 401);
    if (user.email !== ADMIN_EMAIL) {
      return json({ error: "관리자만 삭제할 수 있습니다." }, 403);
    }

    // 2) 대상 확인
    const { userId } = await req.json().catch(() => ({}));
    if (!userId) return json({ error: "userId가 필요합니다." }, 400);
    if (userId === user.id) {
      return json({ error: "본인 계정은 삭제할 수 없습니다." }, 400);
    }

    // 3) service_role로 실제 삭제 (RLS 우회)
    const admin = createClient(SUPABASE_URL, SERVICE);
    // 가입정보 먼저 삭제
    await admin.from("profiles").delete().eq("id", userId);
    // 로그인 계정 삭제 → 이메일 재사용(재가입) 가능
    const { error: dErr } = await admin.auth.admin.deleteUser(userId);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
