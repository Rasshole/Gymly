# send-push (FCM HTTP v1)

1. I Firebase Console: opret service account med **Firebase Cloud Messaging API** (v1) adgang, eller brug en eksisterende projekt-servicekonto, og download **JSON-nøglen** (ikke APNs key — den uploades separat under Project Settings → Cloud Messaging → Apple).

2. I Supabase: **Project Settings → Edge Functions → Secrets**:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = hele JSON som én streng (sæt `project_id` i filen; matcher Firebase-projekt med samme iOS `GoogleService-Info.plist`).
   - `PUSH_WEBHOOK_SECRET` = et langt, tilfældigt hemmeligt ord (bruges i webhook-header).

3. Deploy: `supabase functions deploy send-push`

4. **Database Webhook** (Dashboard → Database → Webhooks):
   - Table: `public.notifications`
   - Events: `INSERT`
   - HTTP Request: `POST` til `https://<project-ref>.supabase.co/functions/v1/send-push`
   - HTTP Headers: `X-Webhook-Secret: <samme som PUSH_WEBHOOK_SECRET>`, `Content-Type: application/json`
   - Brug **ingen** bruger-JWT; funktionen validerer kun webhook-secret.

5. iOS: upload **APNs Authentication Key** (.p8) i Firebase under Cloud Messaging, og aktiver **Push Notifications** + **Background Modes → Remote notifications** i Xcode for target **GymlyFresh**.

6. Tjek at appen (React Native) gemmer FCM-token i `user_push_tokens` og at `notification_preferences` opdateres fra appen; Edge Function læser begge dele.
