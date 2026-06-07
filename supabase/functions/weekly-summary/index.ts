// weekly-summary — 주간 AI 요약 메일 발송 Edge Function
// 흐름: 화면에서 만든 데이터 요약(dataSummary)을 받아 → Claude로 주간 요약 생성
//       → 간단한 HTML 메일로 변환 → Brevo API로 관리자에게 발송.
// analyze-risk 와 동일하게 사용자 JWT 검증 + 관리자(approved) 확인 후 동작.
//
// 필요한 Edge Functions Secrets:
//   - ANTHROPIC_API_KEY  (이미 analyze-risk 에서 사용 중)
//   - BREVO_API_KEY      (이번에 새로 등록)
//   - BREVO_SENDER       (Brevo에서 인증한 발신 이메일 주소, 예: gabeenya@gmail.com)
//   - SUPABASE_URL / SUPABASE_ANON_KEY 는 런타임에 자동 주입됨

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "gabeenya@gmail.com";
const MODEL = "claude-sonnet-4-6";

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

// 아주 단순한 마크다운 → HTML 변환 (제목/굵게/목록/줄바꿈만)
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(md).split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s/, "");
      const size = level <= 1 ? 18 : level === 2 ? 16 : 14;
      out.push(
        `<h${level} style="font-size:${size}px;color:#1A2744;margin:18px 0 8px">${text}</h${level}>`,
      );
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) {
        out.push('<ul style="margin:6px 0 6px 18px;padding:0">');
        inList = true;
      }
      out.push(`<li style="margin:3px 0">${line.replace(/^[-*]\s/, "")}</li>`);
    } else if (line === "") {
      closeList();
      out.push("");
    } else {
      closeList();
      out.push(`<p style="margin:6px 0">${line}</p>`);
    }
  }
  closeList();
  // **굵게** 처리
  return out.join("\n").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function wrapEmail(bodyHtml: string, dateStr: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:24px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#1A2744;padding:20px 28px">
      <div style="color:#fff;font-size:13px;letter-spacing:1px;opacity:.8">이랜드그룹 리스크 관리 시스템</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px">주간 리스크 요약 (${dateStr})</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.7">${bodyHtml}</div>
    <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #eee;color:#888;font-size:11px">
      본 메일은 AI(${MODEL})가 자동 생성한 요약입니다. 상세 데이터는 대시보드에서 확인하세요.
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // 1) 사용자 인증 + 관리자 확인
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: uErr } = await sb.auth.getUser();
    if (uErr || !user) return json({ error: "인증 실패" }, 401);
    if (user.email !== ADMIN_EMAIL) {
      return json({ error: "관리자만 발송할 수 있습니다." }, 403);
    }

    const { dataSummary, periodLabel } = await req.json();
    if (!dataSummary) return json({ error: "데이터 요약이 비어 있습니다." }, 400);

    const dateStr = periodLabel ||
      new Date().toISOString().slice(0, 10);

    // 2) Claude 로 주간 요약 생성
    const prompt =
      `당신은 이랜드그룹 리스크 관리 담당 분석가입니다. 아래 데이터를 바탕으로 ` +
      `경영진이 1~2분 안에 읽을 수 있는 "주간 리스크 요약"을 한국어로 작성하세요.\n\n` +
      `형식:\n` +
      `## 한 줄 총평\n` +
      `## 주목할 변화 (3~5개, 불릿)\n` +
      `## 위험 등급 핵심 항목\n` +
      `## 이번 주 권장 조치 (2~3개)\n\n` +
      `간결하게, 숫자 근거를 포함해 작성하세요.\n\n` +
      `[데이터]\n${dataSummary}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI 호출 실패: ${t}` }, 502);
    }
    const aiData = await aiRes.json();
    const md = aiData?.content?.[0]?.text || "(빈 응답)";

    // 3) Brevo 로 메일 발송
    const html = wrapEmail(mdToHtml(md), dateStr);
    const sender = Deno.env.get("BREVO_SENDER")!;
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": Deno.env.get("BREVO_API_KEY")!,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "리스크 관리 시스템", email: sender },
        to: [{ email: ADMIN_EMAIL }],
        subject: `[리스크 주간 요약] ${dateStr}`,
        htmlContent: html,
      }),
    });
    if (!brevoRes.ok) {
      const t = await brevoRes.text();
      return json({ error: `메일 발송 실패: ${t}` }, 502);
    }

    return json({
      ok: true,
      sentTo: ADMIN_EMAIL,
      usage: aiData?.usage || null,
      model: MODEL,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
