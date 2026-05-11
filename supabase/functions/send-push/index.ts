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
import {SignJWT, importPKCS8} from "https://esm.sh/jose@5.9.6";

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

type DispatchStatus = "pending" | "sent" | "failed";

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });
}

function parseJsonSafe(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {raw: value};
  } catch {
    return {raw: value};
  }
}

async function insertDispatchRow(
  admin: ReturnType<typeof createClient>,
  input: {
    notificationId: string;
    recipientId: string;
    token: string;
    status: DispatchStatus;
    response?: Record<string, unknown> | null;
    error?: string | null;
  },
): Promise<string | null> {
  const {data, error} = await admin
    .from("notification_push_dispatches")
    .insert({
      notification_id: input.notificationId,
      recipient_id: input.recipientId,
      token: input.token,
      status: input.status,
      provider: "firebase",
      response: input.response ?? null,
      error: input.error ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("send-push: dispatch insert failed", {
      notificationId: input.notificationId,
      recipient_id: input.recipientId,
      status: input.status,
      error: error.message,
    });
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

async function updateDispatchRow(
  admin: ReturnType<typeof createClient>,
  dispatchId: string,
  patch: {
    status: DispatchStatus;
    response?: Record<string, unknown> | null;
    error?: string | null;
  },
): Promise<void> {
  const {error} = await admin
    .from("notification_push_dispatches")
    .update({
      status: patch.status,
      response: patch.response ?? null,
      error: patch.error ?? null,
    })
    .eq("id", dispatchId);
  if (error) {
    console.error("send-push: dispatch update failed", {
      dispatchId,
      status: patch.status,
      error: error.message,
    });
  }
}

async function getAccessTokenFromServiceAccount(
  saJson: string,
): Promise<string> {
  const sa = JSON.parse(saJson) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  if (!sa.client_email || !sa.private_key) {
    throw new Error("service account missing client_email/private_key");
  }
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";

  const normalizedPrivateKey = sa.private_key
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
  const privateKeyPem = normalizedPrivateKey.includes("BEGIN PRIVATE KEY")
    ? normalizedPrivateKey
    : `-----BEGIN PRIVATE KEY-----\n${normalizedPrivateKey}\n-----END PRIVATE KEY-----`;

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(privateKeyPem, "RS256");
  const assertion = await new SignJWT({scope: SCOPES})
    .setProtectedHeader({alg: "RS256", typ: "JWT"})
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: form.toString(),
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`oauth token error ${tokenRes.status}: ${tokenText}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(tokenText) as Record<string, unknown>;
  } catch {
    throw new Error(`oauth token parse failed: ${tokenText}`);
  }
  const accessToken = parsed.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(`oauth token missing access_token: ${tokenText}`);
  }
  return accessToken;
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

async function countUnreadNotificationsForBadge(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const {count, error} = await admin
    .from("notifications")
    .select("id", {count: "exact", head: true})
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) {
    console.warn("send-push: badge count failed", error.message);
    return 0;
  }
  return typeof count === "number" ? count : 0;
}

function mirrorCamelSnake(out: Record<string, string>, camel: string, snake: string) {
  const v = out[camel];
  if (v != null && v !== "" && out[snake] == null) {
    out[snake] = v;
  }
}

/** FCM `data` must be string values; include snake_case aliases for iOS handlers. */
function buildDataPayload(rec: NotifRow): Record<string, string> {
  const out: Record<string, string> = {
    type: rec.type,
    notificationId: rec.id,
    notification_id: rec.id,
  };

  const d = rec.data as Record<string, unknown> | null;
  if (d) {
    for (const [k, v] of Object.entries(d)) {
      if (v == null) {
        continue;
      }
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  if (rec.actor_user_id) {
    out.senderId = out.senderId ?? rec.actor_user_id;
    out.sender_id = out.sender_id ?? rec.actor_user_id;
    if (!out.user_id) {
      out.user_id = rec.actor_user_id;
    }
  }

  mirrorCamelSnake(out, "senderId", "sender_id");
  mirrorCamelSnake(out, "threadId", "thread_id");
  mirrorCamelSnake(out, "chatId", "chat_id");
  mirrorCamelSnake(out, "conversationId", "conversation_id");
  mirrorCamelSnake(out, "fromUserId", "from_user_id");
  mirrorCamelSnake(out, "friendUserId", "friend_user_id");
  mirrorCamelSnake(out, "checkInId", "check_in_id");
  mirrorCamelSnake(out, "centerId", "center_id");
  mirrorCamelSnake(out, "centerName", "center_name");
  mirrorCamelSnake(out, "badgeId", "badge_id");
  mirrorCamelSnake(out, "badgeName", "badge_name");
  mirrorCamelSnake(out, "friendRequestId", "friend_request_id");
  mirrorCamelSnake(out, "actorName", "actor_name");

  const chat =
    out.chat_id ?? out.chatId ?? out.thread_id ?? out.threadId ?? out.conversation_id ??
    out.conversationId ?? "";
  if (chat !== "") {
    out.chat_id = out.chat_id ?? chat;
  }

  let targetId = out.target_id ?? out.notification_id;
  if (rec.type === "friend_request" && out.friend_request_id) {
    targetId = out.friend_request_id;
  } else if (rec.type === "friend_checked_in" && out.check_in_id) {
    targetId = out.check_in_id;
  } else if (
    (rec.type === "badge_unlocked" || rec.type === "badge_progress" ||
      rec.type === "streak_milestone") && out.badge_id
  ) {
    targetId = out.badge_id;
  } else if (rec.type === "dm_message" && chat !== "") {
    targetId = chat;
  }
  out.target_id = targetId;

  return out;
}

async function loadPushTokens(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<PushTokenRow[]> {
  const primary = await admin
    .from("user_push_tokens")
    .select("token, platform")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (!primary.error && primary.data) {
    return primary.data as PushTokenRow[];
  }
  const fallback = await admin
    .from("push_tokens")
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
    .from("user_push_tokens")
    .update(patch)
    .eq("user_id", userId)
    .eq("token", token);
  await admin
    .from("push_tokens")
    .update(patch)
    .eq("user_id", userId)
    .eq("token", token);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ok: false, error: "method"}, 405);
    }
    console.log("send-push: called", {
      method: req.method,
      hasWebhookSecretHeader: Boolean(req.headers.get("X-Webhook-Secret")),
      hasAuthorizationHeader: Boolean(req.headers.get("Authorization")),
    });

    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    const hdr = req.headers.get("X-Webhook-Secret");
    if (secret && hdr !== secret) {
      console.warn("send-push: webhook secret mismatch; continuing without hard reject");
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
    console.log("send-push: env check", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRole: Boolean(supabaseKey),
      hasGoogleServiceAccount: Boolean(saJson),
      hasProjectId: Boolean(projectId),
    });

    let payload: {record?: NotifRow; type?: string; notification_id?: string};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ok: false, error: "bad json"}, 400);
    }

    const admin = createClient(supabaseUrl, supabaseKey, {
      auth: {persistSession: false},
    });

    let rec = payload.record;
    if ((!rec?.id || !rec.user_id) && payload.notification_id) {
      const byId = await admin
        .from("notifications")
        .select("id, user_id, actor_user_id, type, title, body, data")
        .eq("id", payload.notification_id)
        .maybeSingle();
      if (byId.error) {
        return jsonResponse({ok: false, error: `notification lookup failed: ${byId.error.message}`}, 400);
      }
      rec = (byId.data as NotifRow | null) ?? undefined;
    }
    if (!rec?.id || !rec.user_id) {
      return jsonResponse({ok: false, error: "no record"}, 400);
    }
    console.log("send-push: notification created", {
      notificationId: rec.id,
      recipient_id: rec.user_id,
      actor_user_id: rec.actor_user_id,
      type: rec.type,
    });

    if (rec.actor_user_id && rec.actor_user_id === rec.user_id) {
      console.log("send-push: skipped self notification", {
        notificationId: rec.id,
        userId: rec.user_id,
      });
      return jsonResponse({ok: true, skipped: "self"});
    }

    /** Launch focus: no ranking / rank-drop pushes — reserved for future competitive systems. */
    const suppressedRankingPushTypes = new Set<string>(["leaderboard_movement"]);
    if (suppressedRankingPushTypes.has(String(rec.type || "").trim())) {
      console.log("send-push: skipped ranking notification type", {
        notificationId: rec.id,
        type: rec.type,
      });
      return jsonResponse({ok: true, skipped: "ranking_launch_suppressed"});
    }

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
      console.log("send-push: skipped by preferences", {
        notificationId: rec.id,
        recipient_id: rec.user_id,
        type: rec.type,
      });
      return jsonResponse({ok: true, skipped: "preferences"});
    }

    const tokens = await loadPushTokens(admin, rec.user_id);
    console.log("send-push: recipient tokens found", {userId: rec.user_id, count: tokens.length});
    if (!tokens.length) {
      return jsonResponse({ok: true, sent: 0, reason: "no tokens"});
    }

    let access = "";
    try {
      access = await getAccessTokenFromServiceAccount(saJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("send-push: google auth failed", {error: message});
      return jsonResponse({ok: false, error: "google auth failed", detail: message}, 500);
    }

    const badge = await countUnreadNotificationsForBadge(admin, rec.user_id);
    const dataPayload = buildDataPayload(rec);

    let sent = 0;
    let disabled = 0;
    for (const t of tokens) {
      const dispatchId = await insertDispatchRow(admin, {
        notificationId: rec.id,
        recipientId: rec.user_id,
        token: t.token,
        status: "pending",
      });
      if (dispatchId) {
        console.log("send-push: dispatch inserted", {
          dispatch_id: dispatchId,
          notification_id: rec.id,
          recipient_id: rec.user_id,
        });
      }
      const body = {
        message: {
          token: t.token,
          notification: {
            title: rec.title,
            body: rec.body,
          },
          data: dataPayload,
          android: {
            notification: {
              sound: "default",
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                sound: "default",
                badge,
              },
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
      const responseText = await r.text();
      const responsePayload = parseJsonSafe(responseText);
      if (r.ok) {
        sent += 1;
        if (dispatchId) {
          await updateDispatchRow(admin, dispatchId, {
            status: "sent",
            response: responsePayload,
            error: null,
          });
        }
        console.log("send-push: firebase success", {
          notificationId: rec.id,
          recipient_id: rec.user_id,
          tokenPrefix: t.token.slice(0, 12),
          status: r.status,
          response: responseText,
        });
      } else {
        if (dispatchId) {
          await updateDispatchRow(admin, dispatchId, {
            status: "failed",
            response: responsePayload,
            error: responseText,
          });
        }
        console.error("send-push: firebase error", {
          notificationId: rec.id,
          recipient_id: rec.user_id,
          tokenPrefix: t.token.slice(0, 12),
          status: r.status,
          error: responseText,
        });
        if (
          responseText.includes("UNREGISTERED") ||
          responseText.includes("registration-token-not-registered") ||
          responseText.includes("INVALID_ARGUMENT")
        ) {
          await disableInvalidToken(admin, rec.user_id, t.token);
          disabled += 1;
        }
      }
    }

    console.log("send-push: result", {notificationId: rec.id, sent, disabled});
    return jsonResponse({ok: true, sent, disabled});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("send-push: unhandled exception", {error: message, stack});
    return jsonResponse(
      {
        ok: false,
        error: "unhandled exception",
        detail: message,
      },
      500,
    );
  }
});
