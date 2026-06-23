// Synthetic health probe — runs every ~5 min via pg_cron.
// Probes: signup boot, Brevo egress, critical-function load.
// Alerts via Slack webhook (primary) + Brevo email (secondary).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");
const ALERT_EMAIL_TO = Deno.env.get("ALERT_EMAIL_TO") || "support@insiderpulse.org";
const ALERT_EMAIL_FROM = Deno.env.get("EMAIL_SENDER_ADDRESS") || "support@insiderpulse.org";
const ALERT_COOLDOWN_MIN = 15; // don't re-alert same probe within N minutes

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ProbeResult = {
  probe_name: string;
  target: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number;
  error_body: string | null;
  metadata?: Record<string, unknown>;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

// --- Probes ---------------------------------------------------------------

async function probeSignupBoot(): Promise<ProbeResult> {
  const url = `${SUPABASE_URL}/functions/v1/custom-auth-email`;
  const { result: res, ms } = await timed(() =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: "probe" }),
    }),
  );
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }
  const ok = res.status === 200 && parsed?.success === true && parsed?.brevo_key_configured === true;
  return {
    probe_name: "signup_boot",
    target: "custom-auth-email (action=probe)",
    ok,
    status_code: res.status,
    latency_ms: ms,
    error_body: ok ? null : text.slice(0, 2000),
    metadata: { parsed },
  };
}

async function probeBrevoEgress(): Promise<ProbeResult> {
  if (!BREVO_API_KEY) {
    return {
      probe_name: "brevo_egress",
      target: "https://api.brevo.com/v3/account",
      ok: false,
      status_code: null,
      latency_ms: 0,
      error_body: "BREVO_API_KEY not configured",
    };
  }
  const { result: res, ms } = await timed(() =>
    fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { "api-key": BREVO_API_KEY!, Accept: "application/json" },
    }),
  );
  const text = await res.text();
  const ok = res.ok; // 2xx
  return {
    probe_name: "brevo_egress",
    target: "https://api.brevo.com/v3/account",
    ok,
    status_code: res.status,
    latency_ms: ms,
    error_body: ok ? null : text.slice(0, 2000),
  };
}

async function probeFunctionBoot(fnName: string): Promise<ProbeResult> {
  // OPTIONS preflight — exercises the runtime loader without invoking business logic.
  // LOAD_FUNCTION_ERROR surfaces as 503 here.
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const { result: res, ms } = await timed(() =>
    fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://insiderpulse.org",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    }),
  );
  const text = await res.text().catch(() => "");
  const ok = res.status >= 200 && res.status < 400;
  return {
    probe_name: `boot_${fnName.replace(/-/g, "_")}`,
    target: `${fnName} (OPTIONS)`,
    ok,
    status_code: res.status,
    latency_ms: ms,
    error_body: ok ? null : text.slice(0, 2000),
  };
}

// --- Alerting -------------------------------------------------------------

function fmtSlackPayload(p: ProbeResult, lastSuccessAt: string | null): string {
  const lines = [
    `:rotating_light: *InsiderPulse health probe FAILED*`,
    `*Probe:* \`${p.probe_name}\``,
    `*Target:* ${p.target}`,
    `*Status:* ${p.status_code ?? "n/a"}`,
    `*Latency:* ${p.latency_ms} ms`,
    `*Time (UTC):* ${new Date().toISOString()}`,
    `*Last success:* ${lastSuccessAt ?? "never recorded"}`,
    `*Error:* \`\`\`${(p.error_body ?? "").slice(0, 1500)}\`\`\``,
  ];
  return lines.join("\n");
}

function fmtEmailHtml(p: ProbeResult, lastSuccessAt: string | null): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#020817;color:#F1F5F9;padding:24px;">
  <h2 style="color:#F87171;">🚨 Health probe FAILED: ${p.probe_name}</h2>
  <table style="border-collapse:collapse;font-size:14px;line-height:1.6;">
    <tr><td><b>Target</b></td><td>${p.target}</td></tr>
    <tr><td><b>Status</b></td><td>${p.status_code ?? "n/a"}</td></tr>
    <tr><td><b>Latency</b></td><td>${p.latency_ms} ms</td></tr>
    <tr><td><b>Time (UTC)</b></td><td>${new Date().toISOString()}</td></tr>
    <tr><td><b>Last success</b></td><td>${lastSuccessAt ?? "never recorded"}</td></tr>
  </table>
  <h4>Error body</h4>
  <pre style="background:#0F1729;border:1px solid rgba(255,255,255,0.1);padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;color:#94A3B8;font-size:12px;">${(p.error_body ?? "").slice(0, 4000).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]!))}</pre>
  </body></html>`;
}

async function sendSlackAlert(p: ProbeResult, lastSuccessAt: string | null): Promise<{ ok: boolean; status: number | null; error?: string }> {
  if (!SLACK_WEBHOOK_URL) return { ok: false, status: null, error: "SLACK_WEBHOOK_URL not configured" };
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: fmtSlackPayload(p, lastSuccessAt) }),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).message };
  }
}

async function sendEmailAlert(p: ProbeResult, lastSuccessAt: string | null): Promise<{ ok: boolean; status: number | null; error?: string }> {
  if (!BREVO_API_KEY) return { ok: false, status: null, error: "BREVO_API_KEY not configured" };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY!, Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "InsiderPulse Monitor", email: ALERT_EMAIL_FROM },
        to: [{ email: ALERT_EMAIL_TO }],
        subject: `🚨 Health probe FAILED: ${p.probe_name} (${p.status_code ?? "n/a"})`,
        htmlContent: fmtEmailHtml(p, lastSuccessAt),
      }),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).message };
  }
}

// --- Orchestration --------------------------------------------------------

async function recordResult(p: ProbeResult) {
  await supabase.from("health_probe_results").insert({
    probe_name: p.probe_name,
    target: p.target,
    status_code: p.status_code,
    ok: p.ok,
    latency_ms: p.latency_ms,
    error_body: p.error_body,
    metadata: p.metadata ?? null,
  });
}

async function maybeAlert(p: ProbeResult): Promise<{ alerted: boolean; slack?: any; email?: any; reason?: string }> {
  // Read prior state
  const { data: state } = await supabase
    .from("health_probe_alert_state")
    .select("*")
    .eq("probe_name", p.probe_name)
    .maybeSingle();

  const now = new Date();
  const nowIso = now.toISOString();
  const lastSuccessAt = state?.last_success_at ?? null;

  if (p.ok) {
    // Healthy: reset failure streak, update last_success_at
    await supabase.from("health_probe_alert_state").upsert({
      probe_name: p.probe_name,
      last_success_at: nowIso,
      consecutive_failures: 0,
      updated_at: nowIso,
      last_alert_sent_at: state?.last_alert_sent_at ?? null,
      last_failure_at: state?.last_failure_at ?? null,
    });
    return { alerted: false };
  }

  // Failed — check cooldown
  const lastAlertMs = state?.last_alert_sent_at ? Date.parse(state.last_alert_sent_at) : 0;
  const withinCooldown = lastAlertMs > 0 && (now.getTime() - lastAlertMs) < ALERT_COOLDOWN_MIN * 60_000;
  const newFailures = (state?.consecutive_failures ?? 0) + 1;

  if (withinCooldown) {
    await supabase.from("health_probe_alert_state").upsert({
      probe_name: p.probe_name,
      consecutive_failures: newFailures,
      last_failure_at: nowIso,
      last_success_at: lastSuccessAt,
      last_alert_sent_at: state?.last_alert_sent_at,
      updated_at: nowIso,
    });
    return { alerted: false, reason: `cooldown (${ALERT_COOLDOWN_MIN}m)` };
  }

  // Fire alerts — Slack first (independent of Brevo), email second (redundant)
  const slack = await sendSlackAlert(p, lastSuccessAt);
  const email = await sendEmailAlert(p, lastSuccessAt);

  await supabase.from("health_probe_alert_state").upsert({
    probe_name: p.probe_name,
    consecutive_failures: newFailures,
    last_failure_at: nowIso,
    last_alert_sent_at: nowIso,
    last_success_at: lastSuccessAt,
    updated_at: nowIso,
  });

  return { alerted: true, slack, email };
}

async function runAllProbes(): Promise<ProbeResult[]> {
  const targets = [
    probeSignupBoot(),
    probeBrevoEgress(),
    probeFunctionBoot("custom-auth-email"),
    probeFunctionBoot("get-assets"),
    // manage-payments is the live checkout entrypoint (create-checkout is deprecated, scheduled for removal)
    probeFunctionBoot("manage-payments"),
  ];
  const settled = await Promise.allSettled(targets);
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return {
      probe_name: `probe_${i}_threw`,
      target: "n/a",
      ok: false,
      status_code: null,
      latency_ms: 0,
      error_body: (s.reason as Error)?.message ?? String(s.reason),
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "1";

  // Test-alert mode: fire a synthetic alert to both channels without running probes.
  if (isTest) {
    const fakeFailure: ProbeResult = {
      probe_name: "test_alert",
      target: "synthetic-health-probe?test=1",
      ok: false,
      status_code: 599,
      latency_ms: 0,
      error_body: "This is a TEST alert from synthetic-health-probe. If you see this in Slack and email, the alert pipeline works end-to-end.",
    };
    const slack = await sendSlackAlert(fakeFailure, null);
    const email = await sendEmailAlert(fakeFailure, null);
    return new Response(JSON.stringify({ test: true, slack, email }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = await runAllProbes();
  const alerts: Array<{ probe: string; alerted: boolean; slack?: any; email?: any; reason?: string }> = [];

  for (const r of results) {
    await recordResult(r);
    const a = await maybeAlert(r);
    alerts.push({ probe: r.probe_name, ...a });
  }

  const failed = results.filter((r) => !r.ok);
  return new Response(
    JSON.stringify({
      ran_at: new Date().toISOString(),
      total: results.length,
      failed: failed.length,
      results,
      alerts,
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
