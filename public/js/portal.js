/* Customer portal: auth, live AI suggestion, ticket creation, my tickets. */
(function () {
  const $ = (id) => document.getElementById(id);
  const authView = $('auth-view'), appView = $('app-view');
  let mode = 'login';
  let catTouched = false;
  let categories = [];

  /* ---------- auth ---------- */
  function setMode(m) {
    mode = m;
    $('tab-login').setAttribute('aria-selected', m === 'login');
    $('tab-register').setAttribute('aria-selected', m === 'register');
    $('name-field').classList.toggle('hidden', m === 'login');
    $('auth-submit').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('pass-hint').textContent = m === 'register' ? 'At least 8 characters.' : '';
    $('a-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-error').textContent = '';
  }
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-register').addEventListener('click', () => setMode('register'));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('auth-error').textContent = '';
    try {
      const body = { email: $('a-email').value.trim(), password: $('a-pass').value };
      if (mode === 'register') body.full_name = $('a-name').value;
      const r = await SD.api(`/auth/${mode}`, { method: 'POST', body });
      SD.setSession(r.token, r.user);
      start();
    } catch (err) { $('auth-error').textContent = err.message; }
  });

  $('signout').addEventListener('click', () => { SD.clearSession(); location.reload(); });

  /* ---------- live AI suggestion ---------- */
  let timer, lastText = '';
  function onType() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const text = `${$('t-subject').value}\n${$('t-desc').value}`.trim();
      if (text === lastText) return;
      lastText = text;
      try {
        const s = await SD.api('/ai/suggest', { method: 'POST', body: { text } });
        const box = $('suggest');
        if (!s.ready) { box.innerHTML = '<span class="hint">Keep typing and we will suggest a category and urgency.</span>'; return; }
        box.innerHTML = `<div class="suggest-row">
          <span class="hint">We think this is</span>
          <span class="chip p-medium">${SD.esc(s.category)}</span>
          <span class="chip p-${SD.esc(s.priority)}">${SD.esc(s.priority)} priority</span>
          <span class="chip s-${SD.esc(s.sentiment)}">${SD.esc(s.sentiment)} tone</span></div>`;
        if (!catTouched) {
          const match = categories.find((c) => c.name === s.category);
          if (match) $('t-cat').value = match.id;
        }
      } catch { /* suggestions are optional; stay quiet */ }
    }, 500);
  }
  $('t-subject').addEventListener('input', onType);
  $('t-desc').addEventListener('input', onType);
  $('t-cat').addEventListener('change', () => { catTouched = true; });

  /* ---------- create ticket ---------- */
  $('ticket-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('ticket-error').textContent = '';
    const btn = $('ticket-submit'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await SD.api('/tickets', { method: 'POST', body: {
        subject: $('t-subject').value, description: $('t-desc').value, category_id: $('t-cat').value || null } });
      SD.toast(`Ticket ${r.ticket.ticket_no} sent`);
      $('ticket-form').reset(); catTouched = false; lastText = '';
      $('suggest').innerHTML = '<span class="hint">Keep typing and we will suggest a category and urgency.</span>';
      loadMine();
    } catch (err) { $('ticket-error').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Send ticket'; }
  });

  /* ---------- my tickets ---------- */
  function render(tickets) {
    const el = $('mine');
    if (!tickets.length) { el.innerHTML = '<p class="hint">No tickets yet. Your first one will show up here.</p>'; return; }
    el.innerHTML = tickets.map((t) => `
      <article class="ticket-item" data-tilt>
        <div class="top"><span>${SD.esc(t.ticket_no)}</span><span class="chip p-${SD.esc(t.priority)}">${SD.esc(t.priority)}</span></div>
        <div>${SD.esc(t.subject)}</div>
        <div class="hint">${SD.esc(t.category_name || 'General')} · <span class="status">${SD.esc(SD.label(t.status))}</span>
          · ${t.agent_name ? 'With ' + SD.esc(t.agent_name) : 'Waiting for an agent'}</div>
      </article>`).join('');
    if (window.VanillaTilt) VanillaTilt.init(el.querySelectorAll('[data-tilt]'), { max: 6, speed: 400, scale: 1.01 });
  }
  async function loadMine() {
    try { render((await SD.api('/tickets/mine')).tickets); }
    catch (err) { $('mine').innerHTML = `<p class="error">${SD.esc(err.message)}</p>`; }
  }

  /* ---------- boot ---------- */
  async function start() {
    const user = SD.user;
    if (!SD.token || !user) { authView.classList.remove('hidden'); appView.classList.add('hidden'); return; }
    if (user.role !== 'customer') {
      authView.classList.remove('hidden'); appView.classList.add('hidden');
      $('auth-error').innerHTML = 'You are signed in as staff. Use the <a href="/dashboard.html">agent desk</a>, or sign out and use a customer account.';
      return;
    }
    authView.classList.add('hidden'); appView.classList.remove('hidden');

    // Categories for the dropdown
    try { categories = (await SD.api('/ai/categories')).categories; } catch { categories = []; }
    $('t-cat').innerHTML = '<option value="">Let AI decide</option>' + categories.map((c) => `<option value="${c.id}">${SD.esc(c.name)}</option>`).join('');

    // Prefill from chat widget hand-off
    const q = new URLSearchParams(location.search);
    if (q.get('subject')) $('t-subject').value = q.get('subject');
    if (q.get('description')) { $('t-desc').value = q.get('description'); onType(); }

    loadMine();
    SD.connectSocket({ 'ticket:updated': loadMine, 'ticket:new': loadMine });
  }
  start();
})();
