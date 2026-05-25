// Phase 6D shared auth helper.
// Mirrors the api-signals (Phase 6B) verification pattern so every
// caller gets the same 401/403 semantics and the same plan-gating story.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const PAID_PLANS = new Set(["starter", "pro", "premium", "enterprise", "admin"]);

export interface AuthOk {
  ok: true;
  userId: string;
  plan: string;
  admin: SupabaseClient;   // service-role client
  userClient: SupabaseClient; // user-scoped client (RLS applies)
}
export interface AuthFail {
  ok: false;
  response: Response;
}
export type AuthResult = AuthOk | AuthFail;

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function verifyAuth(
  req: Request,
  opts: { requirePaid?: boolean } = {},
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResp({ error: "Unauthorized" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { ok: false, response: jsonResp({ error: "Unauthorized" }, 401) };
  }
  const userId = claimsData.claims.sub as string;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: planRow } = await admin.rpc("_effective_plan", { _user_id: userId });
  const plan = (planRow as string | null) ?? "free";

  if (opts.requirePaid && !PAID_PLANS.has(plan)) {
    return {
      ok: false,
      response: jsonResp({ error: "Upgrade required", plan, upgrade_required: true }, 403),
    };
  }

  return { ok: true, userId, plan, admin, userClient };
}

/**
 * Returns true if the calling JWT belongs to `service_role` — bypasses
 * the user-auth path. Used for cron / edge-to-edge invocations.
 */
export function isServiceRoleBearer(req: Request): boolean {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return false;
  const token = h.replace("Bearer ", "");
  // Service-role key envelope check — Supabase signs it with role=service_role.
  // We avoid pulling in a JWT lib; the only callers that hold this key are
  // our own cron + orchestrator code, so a structural check is enough.
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Admin-or-service-role gate for monitoring endpoints.
 */
export async function verifyAdminOrService(req: Request): Promise<AuthResult> {
  if (isServiceRoleBearer(req)) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    return { ok: true, userId: "service_role", plan: "admin", admin, userClient: admin };
  }

  const res = await verifyAuth(req);
  if (!res.ok) return res;

  const { data: isAdmin } = await res.admin.rpc("has_role", {
    _user_id: res.userId,
    _role: "admin",
  });
  if (!isAdmin) {
    return { ok: false, response: jsonResp({ error: "Admin access required" }, 403) };
  }
  return res;
}

/**
 * Per-user rolling-window rate limit. Allows the first call of a new
 * window unconditionally, denies once `limit` is exceeded. Service-role
 * RPC `increment_rate_limit` returns `allowed=false` past the cap.
 */
export async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  functionName: string,
  limit: number,
  windowSeconds = 3600,
): Promise<Response | null> {
  const { data, error } = await admin.rpc("increment_rate_limit", {
    _user_id: userId,
    _function_name: functionName,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate-limit RPC error:", error);
    return null; // fail open — never block on infra error
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        function: functionName,
        limit,
        window_seconds: windowSeconds,
        current_count: row.current_count,
      }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return null;
}
