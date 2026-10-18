/* Floating chat widget: quick answers + hand-off to the ticket form. */
(function () {
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  if (!fab || !panel) return;
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const history = [];

  function add(text, me) {
    const b = document.createElement('div');
    b.className = 'bubble' + (me ? ' me' : '');
    b.textContent = text;
    log.appendChild(b); log.scrollTop = log.scrollHeight;
    return b;
  }
  fab.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    fab.setAttribute('aria-expanded', open);
    if (open) { if (!log.children.length) add('Hi! Tell me what is going wrong and I will find the right help.'); input.focus(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; add(text, true); history.push(text);
    const pending = add('Looking into it…');
    try {
      const r = await SD.api('/ai/chat', { method: 'POST', body: { message: text } });
      pending.textContent = r.reply;
      if (r.escalate) {
        const a = document.createElement('a');
        a.className = 'btn btn-primary btn-small'; a.textContent = 'Open a ticket';
        a.href = `/portal.html?subject=${encodeURIComponent(text.slice(0, 80))}&description=${encodeURIComponent(history.join(' '))}`;
        const wrap = document.createElement('div'); wrap.className = 'bubble'; wrap.append(a); log.appendChild(wrap);
      }
    } catch (err) { pending.textContent = err.message; }
    log.scrollTop = log.scrollHeight;
  });
})();
