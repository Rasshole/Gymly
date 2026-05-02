/**
 * Scheduled backend auto-checkout runner.
 *
 * Can be called by:
 * - Supabase Scheduled Function (recommended, every 1-5 min), or
 * - external cron with header X-Auto-Checkout-Secret.
 */
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });
}

type SweepRow = {
  check_in_id: string;
  reason: "inactivity" | "left_geofence";
  distance_m: number | null;
  away_started_at: string | null;
  checked_out: boolean;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ok: false, error: "method_not_allowed"}, 405);
  }

  const expectedSecret = Deno.env.get("AUTO_CHECKOUT_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = req.headers.get("X-Auto-Checkout-Secret");
    if (got !== expectedSecret) {
      return json({ok: false, error: "unauthorized"}, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return json({ok: false, error: "missing_env"}, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {persistSession: false},
  });

  const {data, error} = await admin.rpc("run_auto_checkout_sweep", {
    p_limit: 1000,
  });
  if (error) {
    console.error("[AutoCheckout] rpc error:", error.message);
    return json({ok: false, error: "rpc_failed"}, 500);
  }

  const rows = (data ?? []) as SweepRow[];
  for (const row of rows) {
    console.log("[AutoCheckout] session id:", row.check_in_id);
    console.log("[AutoCheckout] distance:", row.distance_m);
    console.log("[AutoCheckout] away_started_at:", row.away_started_at);
    console.log("[AutoCheckout] reason:", row.reason);
    console.log("[AutoCheckout] checked out:", row.checked_out);
  }

  return json({ok: true, checkedOut: rows.length});
});
