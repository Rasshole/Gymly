/**
 * Supabase Edge Function: send FCM (HTTP v1) når en række indsættes i public.notifications
 *
 * Sæt secrets (Project Settings → Edge Functions):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — hele JSON fra Firebase service account (JSON string)
 *   FCM_PROJECT_ID              — ofte "project_id" i samme JSON (kan udelades hvis i JSON)
 *   PUSH_WEBHOOK_SECRET         — stærkt hemmeligt token; bruges i X-Webhook-Secret header
 *
 * Opret Database Webhook (Dashboard → Database → Webhooks) på public.notifications INSERT
 * URL: https://<ref>.supabase.co/functions/v1/send-push
 * HTTP Header: X-Webhook-Secret: <PUSH_WEBHOOK_SECRET>
 * Brug service role for body — eller: verify_jwt false + secret only
 */

import {createClient} from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {GoogleAuth} from "https://esm.sh/google-auth-library@9.14.0?target=deno";

const SCOPES = "https://www.googleapis.com/auth/firebase.messaging";

type NotifRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type PushTokenRow = {
  token: string;
  platform: string | null;
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });
}

async function getAccessTokenFromServiceAccount(
  saJson: string,
): Promise<string> {
  const auth = new GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: [SCOPES],
  });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t || typeof t !== "string") {
    throw new Error("no access token from GoogleAuth");
  }
  return t;
}

function preferenceAllows(
  type: string,
  prefs: {
    push_enabled: boolean;
    messages_enabled: boolean;
    friend_requests_enabled: boolean;
    check_ins_enabled: boolean;
    badges_streaks_enabled: boolean;
    planned_workouts_enabled: boolean;
    workout_reminders_enabled: boolean;
  } | null,
): boolean {
  const p = prefs ?? {
    push_enabled: true,
    messages_enabled: true,
    friend_requests_enabled: true,
    check_ins_enabled: true,
    badges_streaks_enabled: true,
    planned_workouts_enabled: true,
    workout_reminders_enabled: true,
  };
  if (!p.push_enabled) {
    return false;
  }
  if (type === "dm_message") {
    return p.messages_enabled;
  }
  if (type === "friend_request" || type === "friend_request_accepted") {
    return p.friend_requests_enabled;
  }
  if (type === "friend_checked_in" || type === "workout_reaction" || type === "biceps_reaction") {
    return p.check_ins_enabled;
  }
  if (
    type === "gymly_group_invite" ||
    type === "gymly_group_invite_declined" ||
    type === "gymly_group_member_joined" ||
    type === "gymly_group_message" ||
    type === "gymly_planned_in_group" ||
    type === "gymly_group_check_in"
  ) {
    return p.messages_enabled;
  }
  if (type === "badge_unlocked" || type === "streak_milestone" || type === "badge_progress") {
    return p.badges_streaks_enabled;
  }
  if (
    type === "planned_workout_invite" ||
    type === "planned_workout_accepted" ||
    type === "planned_workout_declined"
  ) {
    return p.planned_workouts_enabled;
  }
  if (type === "planned_workout_reminder" || type === "workout_reminder") {
    return p.workout_reminders_enabled;
  }
  return true;
}

async function loadPushTokens(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<PushTokenRow[]> {
  const primary = await admin
    .from("push_tokens")
    .select("token, platform")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (!primary.error && primary.data) {
    return primary.data as PushTokenRow[];
  }
  const fallback = await admin
    .from("user_push_tokens")
    .select("token, platform")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (fallback.data ?? []) as PushTokenRow[];
}

async function disableInvalidToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
  token: string,
): Promise<void> {
  const patch = {enabled: false, updated_at: new Date().toISOString()};
  await admin
    .from("push_tokens")
    .update(patch)
    .eq("user_id", userId)
    .eq("token", token);
  await admin
    .from("user_push_tokens")
    .update(patch)
    .eq("user_id", userId)
    .eq("token", token);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ok: false, error: "method"}, 405);
  }

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const hdr = req.headers.get("X-Webhook-Secret");
  if (!secret || hdr !== secret) {
    return jsonResponse({ok: false, error: "unauthorized"}, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ok: false, error: "missing supabase env"}, 500);
  }

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) {
    return jsonResponse({ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON not set"}, 500);
  }
  const sa = JSON.parse(saJson) as {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  const projectId = Deno.env.get("FCM_PROJECT_ID") ?? sa.project_id;
  if (!projectId) {
    return jsonResponse({ok: false, error: "no project id"}, 500);
  }

  let payload: {record?: NotifRow; type?: string};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ok: false, error: "bad json"}, 400);
  }

  const rec = payload.record;
  if (!rec?.id || !rec.user_id) {
    return jsonResponse({ok: false, error: "no record"}, 400);
  }

  if (rec.actor_user_id && rec.actor_user_id === rec.user_id) {
    return jsonResponse({ok: true, skipped: "self"});
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: {persistSession: false},
  });

  const {data: pref} = await admin
    .from("notification_preferences")
    .select(
      "push_enabled, messages_enabled, friend_requests_enabled, check_ins_enabled, badges_streaks_enabled, planned_workouts_enabled, workout_reminders_enabled",
    )
    .eq("user_id", rec.user_id)
    .maybeSingle();

  if (!preferenceAllows(rec.type, pref as {
    push_enabled: boolean;
    messages_enabled: boolean;
    friend_requests_enabled: boolean;
    check_ins_enabled: boolean;
    badges_streaks_enabled: boolean;
    planned_workouts_enabled: boolean;
    workout_reminders_enabled: boolean;
  } | null)) {
    return jsonResponse({ok: true, skipped: "preferences"});
  }

  const tokens = await loadPushTokens(admin, rec.user_id);
  if (!tokens.length) {
    return jsonResponse({ok: true, sent: 0, reason: "no tokens"});
  }

  const access = await getAccessTokenFromServiceAccount(saJson);

  const dataPayload: Record<string, string> = {
    type: rec.type,
    notificationId: rec.id,
  };
  const d = rec.data as Record<string, unknown> | null;
  if (d) {
    for (const [k, v] of Object.entries(d)) {
      if (v == null) {
        continue;
      }
      dataPayload[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  if (rec.actor_user_id) {
    dataPayload.senderId = rec.actor_user_id;
  }
  dataPayload.targetUserId = rec.user_id;

  let sent = 0;
  let disabled = 0;
  for (const t of tokens) {
    const body = {
      message: {
        token: t.token,
        notification: {title: rec.title, body: rec.body},
        data: dataPayload,
        apns: {
          payload: {
            aps: {sound: "default"},
          },
        },
      },
    };
    const r = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (r.ok) {
      sent += 1;
    } else {
      const errText = await r.text();
      console.error("FCM error", r.status, errText);
      if (
        errText.includes("UNREGISTERED") ||
        errText.includes("registration-token-not-registered") ||
        errText.includes("INVALID_ARGUMENT")
      ) {
        await disableInvalidToken(admin, rec.user_id, t.token);
        disabled += 1;
      }
    }
  }

  return jsonResponse({ok: true, sent, disabled});
});
