// @ts-nocheck  ← 이 파일은 Supabase(Deno) 서버에서 실행됩니다. VS Code는 Node/웹 기준으로 검사해
//   Deno 전역(Deno.env)·원격 import를 "오류"로 표시하지만 실제 배포·동작은 정상입니다. 이 줄이 그 오탐을 끕니다.
// 이랜드그룹 리스크 관리 — AI 분석 프록시 (Claude API)
// 2026-06-08 업그레이드: ① 스트리밍(SSE) 응답 ② 선택 항목 수에 따른 max_tokens 축소 + 간결 지시
//   - 권한 검사(JWT + profiles.approved)는 기존과 동일하게 유지
//   - 성공 시 Anthropic 스트림(SSE)을 그대로 클라이언트로 중계 → 글자가 즉시 흐르도록
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ITEM_GUIDE: Record<string, string> = {
  "위험도 식별": "현재 데이터에서 가장 시급하거나 심각한 리스크 항목을 우선순위와 함께 식별",
  "트렌드 분석": "시간 흐름에 따른 리스크 발생량의 증감·전월 대비 변화 분석",
  "권고 액션 플랜": "식별된 리스크에 대해 구체적이고 실행 가능한 단기/중기 조치 제안",
  "추세/패턴": "카테고리·계열사·등급별로 반복되는 패턴과 공통 요인 분석",
  "유사 사례 매칭": "데이터 내 유사 리스크 사례를 묶어 그룹화하고 공통 대응 방향 제시",
  "계열사별 비교": "계열사 간 리스크 분포·심각도·처리율 비교와 우수/취약 계열사 도출",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "POST 메서드만 허용" }, 405);

  try {
    // 1) 인증 확인 (Authorization 헤더의 사용자 JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "로그인이 필요합니다" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) return jsonRes({ error: "인증 토큰이 유효하지 않습니다" }, 401);

    // 2) 승인된 사용자만 통과
    const { data: profile } = await sb.from("profiles").select("approved").eq("id", user.id).maybeSingle();
    if (!profile?.approved) return jsonRes({ error: "승인되지 않은 사용자입니다" }, 403);

    // 3) 요청 본문 검증
    const body = await req.json();
    const divisionFilter: string = body.divisionFilter || "";
    const analysisItems: string[] = Array.isArray(body.analysisItems) ? body.analysisItems : [];
    const dataSummary: string = body.dataSummary || "";

    if (analysisItems.length === 0) return jsonRes({ error: "분석 항목을 1개 이상 선택해주세요" }, 400);
    if (!dataSummary.trim()) return jsonRes({ error: "분석할 데이터가 없습니다" }, 400);

    // 4) 프롬프트 구성
    const itemsText = analysisItems
      .map((it, i) => `${i + 1}) ${it} — ${ITEM_GUIDE[it] || ""}`)
      .join("\n");
    const targetText = divisionFilter ? `대상: ${divisionFilter} (단일 계열사)` : "대상: 그룹 전체";

    const prompt = `당신은 이랜드그룹 법무팀의 리스크 관리 전문가입니다. 아래 8대 리스크 모니터링 데이터를 분석하여 한국어로 보고해주세요.

${targetText}

## 분석 요청 항목
${itemsText}

## 모니터링 데이터 (집계)
${dataSummary}

## 출력 형식
- 각 요청 항목마다 "## {항목명}" 헤더로 구분
- 핵심 결론은 굵게, 근거는 데이터를 인용
- 추측보다 숫자 근거 우선. 데이터가 불충분하면 그렇다고 솔직히 명시
- **간결하게**: 항목당 핵심 위주로, 불필요한 서론·반복 없이 작성
- 마지막에 "## 종합 결론" 섹션으로 전체 요약 (3~5문장)`;

    // 5) Claude API 호출 (스트리밍)
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return jsonRes({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다" }, 500);

    // max_tokens는 "최대 상한선"일 뿐 — 올려도 실제 생성된 만큼만 과금되므로 비용은 그대로다.
    // 내용은 프롬프트에서 "간결하게" 지시하므로 필요한 만큼만 쓰고, 상한선만 30000으로 넉넉히 잡아
    //   혹시라도 긴 분석이 중간에 잘리는 일을 막는다(모델 최대치 64000 이내).
    const maxTokens = 30000;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok || !claudeRes.body) {
      const errText = await claudeRes.text().catch(() => "");
      return jsonRes({ error: "Claude API 오류: " + errText }, 502);
    }

    // 6) Anthropic SSE 스트림을 그대로 클라이언트로 중계
    return new Response(claudeRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
