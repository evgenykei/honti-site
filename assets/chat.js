(() => {
  'use strict';
  const endpoint = (window.HONTI_CHAT?.api || '').replace(/\/$/, '');
  const launch = document.createElement('button');
  launch.className = 'hc-launch'; launch.textContent = 'Написать ХОНТИ';
  launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'honti-chat');
  const panel = document.createElement('div'); panel.className = 'hc-panel'; panel.id = 'honti-chat'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Связь с командой ХОНТИ');
  // This template is static. Visitor and operator text is inserted with textContent only.
  panel.innerHTML = `<div class="hc-head"><strong>Связь с командой ХОНТИ</strong><button aria-label="Закрыть чат">×</button></div><div class="hc-log" role="log" aria-live="polite"></div><div class="hc-status" role="status"></div><form class="hc-form"><textarea aria-label="Сообщение" maxlength="2000" placeholder="Расскажите о задаче" required></textarea><input class="hc-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Отправить</button></form><div class="hc-links"><a href="mailto:info@honti-it.ru">Почта</a><a href="https://max.ru/id9719090088_bot" target="_blank" rel="noopener">MAX</a><a href="tel:+79957800111">Позвонить</a></div>`;
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
      if (!response.ok) { if (response.status === 401) { session = null; save(); } throw new Error(body.error || 'Связь временно недоступна'); }
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function poll() {
    clearTimeout(timer);
    if (panel.hidden || document.hidden || !session || busy) return;
    try { const r = await api('/history', session); draw(r.messages); status.textContent = 'Ответ появится здесь. Можно оставить окно открытым.'; }
    catch { status.textContent = 'Не удалось обновить чат. Можно связаться по почте.'; }
    if (!panel.hidden && !document.hidden && session) timer = setTimeout(poll, 15000);
  }
  function close() { panel.hidden = true; launch.setAttribute('aria-expanded','false'); clearTimeout(timer); launch.focus(); }
  launch.onclick = () => {
    if (!panel.hidden) return close();
    panel.hidden = false; launch.setAttribute('aria-expanded','true');
    status.textContent = endpoint ? 'Напишите нам — ответим в этом чате.' : 'Чат подключается. Пока можно написать в MAX или на почту.';
    form.hidden = !endpoint; input.focus(); poll();
  };
  panel.querySelector('.hc-head button').onclick = close;
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : poll());
  form.onsubmit = async e => {
    e.preventDefault(); const text = input.value.trim(); if (!text || busy || !endpoint) return;
    busy = true; send.disabled = true; clearTimeout(timer); status.textContent = 'Отправляем…';
    // Keep the same request ID after a timeout: the backend must not duplicate a message.
    if (!pending || pending.text !== text) pending = {text, request_id:crypto.randomUUID()};
    try {
      if (!session) { session = await api('/session', {website:form.elements.website.value}); save(); }
      const r = await api('/message', {...session,...pending,website:form.elements.website.value});
      draw(r.messages); input.value = ''; pending = null; status.textContent = 'Сообщение принято. Ответ появится здесь.';
    } catch (error) { status.textContent = error.name === 'AbortError' ? 'Не удалось подтвердить отправку. Повторите попытку.' : error.message; }
    finally { busy = false; send.disabled = false; if (session) timer = setTimeout(poll, 15000); }
  };
})();
