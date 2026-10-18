/* Agent desk: live queue, SLA countdown timers, analytics. */
(function () {
  const $ = (id) => document.getElementById(id);
  const authView = $('auth-view'), appView = $('app-view');
  let tickets = [];
  let socket;

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('auth-error').textContent = '';
    try {
      const r = await SD.api('/auth/login', { method: 'POST', body: { email: $('a-email').value.trim(), password: $('a-pass').value } });
      if (r.user.role === 'customer') throw new Error('This account is a customer account. Use Get help instead.');
      SD.setSession(r.token, r.user);
      start();
    } catch (err) { $('auth-error').textContent = err.message; }
  });
  $('signout').addEventListener('click', () => { SD.clearSession(); location.reload(); });

  /* ---------- SLA countdown ---------- */
  function slaCell(t) {
    if (t.status === 'resolved' || t.status === 'closed') {
      return t.sla_breached ? '<span class="sla bad">Breached</span>' : '<span class="sla ok">Met</span>';
    }
    if (t.status === 'waiting_customer') return '<span class="sla paused">Paused</span>';
    if (!t.resolution_due) return '<span class="sla paused">No SLA</span>';
    const left = new Date(t.resolution_due).getTime() - Date.now();
    if (left <= 0) return `<span class="sla bad">Late by ${SD.duration(left)}</span>`;
    const total = new Date(t.resolution_due).getTime() - new Date(t.created_at).getTime();
    const cls = left / total < 0.1 ? 'bad' : left / total < 0.25 ? 'warn' : 'ok';
    return `<span class="sla ${cls}">${SD.duration(left)}</span>`;
  }
  setInterval(() => {
    document.querySelectorAll('[data-sla-id]').forEach((cell) => {
      const t = tickets.find((x) => x.id === Number(cell.dataset.slaId));
      if (t) cell.innerHTML = slaCell(t);
    });
  }, 1000);

  /* ---------- rendering ---------- */
  const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_customer', 'resolved'];
  function renderRows(flashId) {
    const body = $('rows');
    if (!tickets.length) { body.innerHTML = '<tr><td colspan="8" class="hint">Nothing here. New tickets will appear automatically.</td></tr>'; return; }
    body.innerHTML = tickets.map((t) => `
      <tr id="row-${t.id}" class="${t.id === flashId ? 'flash' : ''}">
        <td><b>${SD.esc(t.ticket_no)}</b> ${SD.esc(t.subject)}<small>${SD.esc(t.customer_name)}</small></td>
        <td>${SD.esc(t.category_name || 'General')}</td>
        <td><span class="chip p-${SD.esc(t.priority)}">${SD.esc(t.priority)}</span></td>
        <td class="s-${SD.esc(t.sentiment)}">${SD.esc(t.sentiment)}</td>
        <td>${t.agent_name ? SD.esc(t.agent_name) : `<button class="btn btn-small" data-take="${t.id}" type="button">Take it</button>`}</td>
        <td data-sla-id="${t.id}">${slaCell(t)}</td>
        <td><select data-status="${t.id}" aria-label="Status for ${SD.esc(t.ticket_no)}">
          ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${SD.esc(SD.label(s))}</option>`).join('')}
          ${t.status === 'closed' ? '<option value="closed" selected>closed</option>' : ''}</select></td>
        <td><button class="btn btn-small assist-trigger" data-assist-id="${t.id}" type="button">✦ Assist</button></td>
      </tr>`).join('');
  }

  const bars = (id, data, order) => {
    const keys = order || Object.keys(data);
    const max = Math.max(1, ...keys.map((k) => data[k] || 0));
    $(id).innerHTML = keys.map((k) => `<div class="bar-row"><span>${SD.esc(SD.label(k))}</span><div class="bar"><i style="width:${((data[k] || 0) / max) * 100}%"></i></div><b>${data[k] || 0}</b></div>`).join('')
      || '<span class="hint">No data yet.</span>';
  };

  function renderStats(d) {
    const open = (d.byStatus.open || 0) + (d.byStatus.in_progress || 0) + (d.byStatus.waiting_customer || 0);
    const avg = d.sla.avgResolutionMinutes;
    $('stats').innerHTML = [
      ['Active tickets', open], ['Close to deadline', d.sla.atRisk], ['SLA breaches', d.sla.breached],
      ['SLA compliance', `${d.sla.compliancePct}%`], ['Avg. resolution', avg === null ? 'none yet' : avg >= 60 ? `${Math.round(avg / 60)}h` : `${avg}m`],
    ].map(([label, v]) => `<div class="glass stat"><b>${SD.esc(v)}</b><span>${SD.esc(label)}</span></div>`).join('');
    bars('bars-priority', d.byPriority, ['critical', 'high', 'medium', 'low']);
    bars('bars-sentiment', d.bySentiment, ['angry', 'negative', 'neutral', 'positive']);
    bars('bars-workload', Object.fromEntries(d.workload.map((w) => [w.name, w.open])));
  }

  /* ---------- data ---------- */
  async function loadQueue() {
    const params = new URLSearchParams();
    if ($('f-status').value) params.set('status', $('f-status').value);
    if ($('f-mine').checked) params.set('mine', '1');
    tickets = (await SD.api(`/tickets?${params}`)).tickets;
    renderRows();
  }
  async function loadDashboard() {
    const d = await SD.api('/tickets/dashboard');
    renderStats(d);
    if (!$('f-status').value && !$('f-mine').checked) { tickets = d.tickets; renderRows(); }
  }
  async function update(id, changes) {
    try { await SD.api(`/tickets/${id}`, { method: 'PUT', body: changes }); SD.toast('Ticket updated'); }
    catch (err) { SD.toast(err.message); }
    refresh();
  }
  const refresh = () => Promise.all([loadDashboard(), loadQueue()]).catch((e) => SD.toast(e.message));

  $('rows').addEventListener('change', (e) => { if (e.target.dataset.status) update(Number(e.target.dataset.status), { status: e.target.value }); });
  $('rows').addEventListener('click', async (e) => {
    const takeId = e.target.dataset.take;
    const assistId = e.target.dataset.assistId;
    if (takeId) {
      update(Number(takeId), { assigned_agent_id: SD.user.id });
      return;
    }
    if (!assistId) return;

    const button = e.target;
    const panel = $('assist-panel');
    const ticket = tickets.find((t) => t.id === Number(assistId));
    button.disabled = true;
    button.textContent = 'Thinking…';
    panel.classList.remove('hidden');
    $('assist-title').textContent = 'Preparing ticket assist…';
    $('assist-ticket').textContent = ticket ? `${ticket.ticket_no} · ${ticket.subject}` : '';
    $('assist-summary').textContent = '';
    $('assist-next').textContent = '';
    $('assist-meta').textContent = '';
    try {
      const { assist } = await SD.api(`/tickets/${assistId}/assist`, { method: 'POST' });
      $('assist-title').textContent = 'Ticket assist';
      $('assist-summary').textContent = assist.summary;
      $('assist-next').textContent = assist.nextAction;
      $('assist-meta').innerHTML = [
        `Category: <strong>${SD.esc(assist.category)}</strong>`,
        `Priority: <strong class="chip p-${SD.esc(assist.priority)}">${SD.esc(assist.priority)}</strong>`,
        `Customer tone: <strong>${SD.esc(assist.sentiment)}</strong>`,
        `Method: <strong>${SD.esc(assist.engine)}</strong>`,
      ].map((item) => `<span>${item}</span>`).join('');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      panel.classList.add('hidden');
      SD.toast(err.message);
    } finally {
      button.disabled = false;
      button.textContent = '✦ Assist';
    }
  });
  $('assist-close').addEventListener('click', () => $('assist-panel').classList.add('hidden'));
  $('f-status').addEventListener('change', loadQueue);
  $('f-mine').addEventListener('change', loadQueue);

  function start() {
    if (!SD.token || !SD.user || SD.user.role === 'customer') { authView.classList.remove('hidden'); appView.classList.add('hidden'); return; }
    authView.classList.add('hidden'); appView.classList.remove('hidden');
    refresh();
    socket = SD.connectSocket({
      'ticket:new': (t) => { SD.toast(`New ${t.priority} ticket ${t.ticket_no}`); refresh().then(() => document.getElementById(`row-${t.id}`)?.classList.add('flash')); },
      'ticket:updated': () => refresh(),
      'sla:breach': (t) => SD.toast(`${t.ticket_no} just breached its SLA`),
      connect: () => $('live').classList.remove('off'),
      disconnect: () => $('live').classList.add('off'),
    });
  }
  start();
})();
