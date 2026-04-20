/**
 * Gymly Website – smooth scroll, email-bekræftelse (?confirmed=1), Supabase PKCE/hash på forsiden
 */

const SUPABASE_URL = 'https://ykantlsuszpauddasqvz.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYW50bHN1c3pwYXVkZGFzcXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzI4MzEsImV4cCI6MjA4ODQ0ODgzMX0.vungVzubJCR68aSSusjtmoGNQgLaIOkdQN8ipo9bt-I';

/**
 * Fuldfører Supabase-session når bruger lander med ?code= eller #access_token (efter redirect fra /confirm).
 */
async function completeSupabaseSessionFromUrl() {
  const u = new URL(window.location.href);
  const code = u.searchParams.get('code');
  const hash = u.hash.replace(/^#/, '');
  const hp = new URLSearchParams(hash);
  const at = hp.get('access_token');
  const rt = hp.get('refresh_token');

  if (!code && !(at && rt)) {
    return;
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        storage: localStorage,
        autoRefreshToken: true,
      },
    });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return;
      }
      u.searchParams.delete('code');
    } else if (at && rt) {
      const { error } = await supabase.auth.setSession({
        access_token: at,
        refresh_token: rt,
      });
      if (error) {
        return;
      }
      u.hash = '';
    }

    const qs = u.searchParams.toString();
    const next = u.pathname + (qs ? '?' + qs : '') + u.hash;
    window.history.replaceState(null, '', next);
  } catch {
    /* stille fejl — ingen debug-UI */
  }
}

function stripConfirmedParam() {
  const u = new URL(window.location.href);
  if (u.searchParams.get('confirmed') !== '1') {
    return;
  }
  u.searchParams.delete('confirmed');
  const qs = u.searchParams.toString();
  window.history.replaceState(null, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
}

function setupEmailConfirmedModal() {
  const modal = document.getElementById('email-confirmed-modal');
  if (!modal) {
    return;
  }

  const u = new URL(window.location.href);
  if (u.searchParams.get('confirmed') !== '1') {
    return;
  }

  const close = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  };

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');

  stripConfirmedParam();

  modal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', close);
  });

  const loginBtn = modal.querySelector('[data-login-cta]');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      close();
      const download = document.getElementById('download');
      if (download) {
        download.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') {
        return;
      }
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  await completeSupabaseSessionFromUrl();
  setupEmailConfirmedModal();
});
