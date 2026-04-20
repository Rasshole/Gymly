export const SUPABASE_URL = 'https://ykantlsuszpauddasqvz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYW50bHN1c3pwYXVkZGFzcXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzI4MzEsImV4cCI6MjA4ODQ0ODgzMX0.vungVzubJCR68aSSusjtmoGNQgLaIOkdQN8ipo9bt-I';

/**
 * After email confirm, Supabase redirects here (must be on Redirect URL allow list).
 * In Dashboard: Authentication → URL Configuration:
 * - Site URL: https://gymlyapp.com  ← NOT http://localhost:3000 or links open localhost
 * - Redirect URLs: https://gymlyapp.com/confirm (and legacy https://gymlyapp.com/auth/confirm → /confirm)
 * Host: web/confirm/index.html at https://gymlyapp.com/confirm
 */
export const SUPABASE_EMAIL_REDIRECT = 'https://gymlyapp.com/confirm';
export const SUPABASE_ALLOW_UNVERIFIED_LOGIN = false;
