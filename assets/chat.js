(() => {
  'use strict';
  const english = document.documentElement.lang === 'en';
  const tr = (ru, en) => english ? en : ru;
  const endpoint = (window.HONTI_CHAT?.api || '').replace(/\/$/, '');
  const launch = document.createElement('button');
  launch.className = 'hc-launch'; launch.textContent = tr("Написать ХОНТИ", "Chat with HONTI");
  launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'honti-chat');
  const panel = document.createElement('div'); panel.className = 'hc-panel'; panel.id = 'honti-chat'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', tr("Связь с командой ХОНТИ", "Contact the HONTI team"));
  // This template is static. Visitor and operator text is inserted with textContent only.
  panel.innerHTML = `<div class="hc-head"><strong>${tr("Связь с командой ХОНТИ", "Contact the HONTI team")}</strong><button aria-label="${tr("Закрыть чат", "Close chat")}">×</button></div><div class="hc-log" role="log" aria-live="polite"></div><div class="hc-status" role="status"></div><form class="hc-form"><textarea aria-label="${tr("Сообщение", "Message")}" maxlength="2000" placeholder="${tr("Расскажите о задаче", "Tell us about your project")}" required></textarea><input class="hc-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">${tr("Отправить", "Send")}</button></form><div class="hc-links"><a href="mailto:info@honti-it.ru">${tr("Почта", "Email")}</a><a href="tel:+79957800111">${tr("Позвонить", "Call")}</a></div>`;
  document.body.append(launch, panel);
  const log = panel.querySelector('.hc-log'), status = panel.querySelector('.hc-status');
  const form = panel.querySelector('form'), input = form.querySelector('textarea'), send = form.querySelector('button');
  let session, timer, pending, busy = false;
  try { session = JSON.parse(sessionStorage.getItem('honti-chat-session')); } catch { /* Private mode may deny storage. */ }
  function save() { try { sessionStorage.setItem('honti-chat-session', JSON.stringify(session)); } catch { /* Keep session in memory. */ } }
  function draw(messages) {
    log.replaceChildren();
    for (const m of messages) { const p = document.createElement('div'); p.className = `hc-message ${m.role === 'visitor' ? 'visitor' : 'operator'}`; p.textContent = m.text; log.append(p); }
    log.scrollTop = log.scrollHeight;
  }
  async function api(path, data) {
    const ctl = new AbortController(), timeout = setTimeout(() => ctl.abort(), 12000);
    try {
      const response = await fetch(endpoint + '?action=' + encodeURIComponent(path.slice(1)), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), signal:ctl.signal, credentials:'omit'});
      const body = await response.json();
      if (!response.ok) { if (response.status === 401) { session = null; save(); } throw new Error(body.error || tr("Связь временно недоступна", "Chat is temporarily unavailable")); }
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function poll() {
    clearTimeout(timer);
    if (panel.hidden || document.hidden || !session || busy) return;
    try { const r = await api('/history', session); draw(r.messages); status.textContent = tr("Ответ появится здесь. Можно оставить окно открытым.", "Replies appear here. You can leave this window open."); }
    catch { status.textContent = tr("Не удалось обновить чат. Можно связаться по почте.", "Could not refresh the chat. Please contact us by email."); }
    if (!panel.hidden && !document.hidden && session) timer = setTimeout(poll, 15000);
  }
  function close() { panel.hidden = true; launch.setAttribute('aria-expanded','false'); clearTimeout(timer); launch.focus(); }
  launch.onclick = () => {
    if (!panel.hidden) return close();
    panel.hidden = false; launch.setAttribute('aria-expanded','true');
    status.textContent = endpoint ? tr("Напишите нам — ответим в этом чате.", "Send us a message \u2014 we will reply in this chat.") : tr("Чат подключается. Пока можно написать на почту или позвонить.", "Chat is being connected. Please email or call us for now.");
    form.hidden = !endpoint; input.focus(); poll();
  };
  panel.querySelector('.hc-head button').onclick = close;
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : poll());
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!e.repeat && !busy) form.requestSubmit();
  });
  form.onsubmit = async e => {
    e.preventDefault(); const text = input.value.trim(); if (!text || busy || !endpoint) return;
    busy = true; send.disabled = true; clearTimeout(timer); status.textContent = tr("Отправляем…", "Sending\u2026");
    // Keep the same request ID after a timeout: the backend must not duplicate a message.
    if (!pending || pending.text !== text) pending = {text, request_id:crypto.randomUUID()};
    try {
      if (!session) { session = await api('/session', {website:form.elements.website.value}); save(); }
      const r = await api('/message', {...session,...pending,website:form.elements.website.value});
      draw(r.messages); input.value = ''; pending = null; status.textContent = tr("Сообщение принято. Ответ появится здесь.", "Message received. Replies will appear here.");
    } catch (error) { status.textContent = error.name === 'AbortError' ? tr("Не удалось подтвердить отправку. Повторите попытку.", "Could not confirm delivery. Please try again.") : error.message; }
    finally { busy = false; send.disabled = false; if (session) timer = setTimeout(poll, 15000); }
  };
})();

