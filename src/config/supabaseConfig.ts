export const SUPABASE_URL = 'https://ykantlsuszpauddasqvz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYW50bHN1c3pwYXVkZGFzcXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzI4MzEsImV4cCI6MjA4ODQ0ODgzMX0.vungVzubJCR68aSSusjtmoGNQgLaIOkdQN8ipo9bt-I';

/**
 * After email confirm, Supabase redirects here (must be on Redirect URL allow list).
 * In Dashboard: Authentication → URL Configuration:
 * - Site URL: https://gymlyapp.com  ← NOT http://localhost:3000 or links open localhost
 * - Redirect URLs: https://gymlyapp.com/auth/confirm (and optionally https://gymlyapp.com/**)
 * Host the page from repo: web/auth-confirm/index.html at this path on gymlyapp.com
 */
export const SUPABASE_EMAIL_REDIRECT = 'https://gymlyapp.com/auth/confirm';
export const SUPABASE_ALLOW_UNVERIFIED_LOGIN = false;
