/**
 * webchat-widget.js — Embeddable WebChat Widget
 * @version 1.0.0
 *
 * Uso de una sola línea:
 *   <script
 *     src="https://tu-gateway.com/static/webchat-widget.js"
 *     data-channel-id="<ChannelConfig UUID>"
 *     data-gateway-url="https://tu-gateway.com"
 *     data-title="Asistente"
 *     data-welcome="¡Hola! ¿En qué puedo ayudarte?"
 *     data-primary-color="#01696f"
 *     data-position="right"
 *   ></script>
 *
 * Atributos data-*:
 *   data-channel-id      (requerido) UUID del ChannelConfig
 *   data-gateway-url     (requerido) URL base del gateway sin trailing slash
 *   data-title           Título del panel (default: "Asistente")
 *   data-welcome         Mensaje de bienvenida al abrir (default: "¡Hola!...")
 *   data-primary-color   Color principal hex (default: "#01696f")
 *   data-position        "right" | "left" (default: "right")
 *   data-z-index         z-index del widget (default: 9999)
 */

(function () {
  'use strict';

  // ─── Config desde atributos del script ──────────────────────────────────
  const script =
    document.currentScript ||
    document.querySelector('script[data-channel-id]');

  if (!script) return;

  const CHANNEL_ID   = script.getAttribute('data-channel-id')   || '';
  const GATEWAY_URL  = (script.getAttribute('data-gateway-url') || '').replace(/\/+$/, '');
  const TITLE        = script.getAttribute('data-title')         || 'Asistente';
  const WELCOME      = script.getAttribute('data-welcome')       || '¡Hola! ¿En qué puedo ayudarte hoy?';
  const PRIMARY      = script.getAttribute('data-primary-color') || '#01696f';
  const POSITION     = script.getAttribute('data-position')      || 'right';
  const Z_INDEX      = script.getAttribute('data-z-index')       || '9999';

  if (!CHANNEL_ID || !GATEWAY_URL) {
    console.error('[wchat] data-channel-id and data-gateway-url are required');
    return;
  }

  // ─── Estado ─────────────────────────────────────────────────────────────
  let sessionId = null;
  let isOpen    = false;
  let isLoading = false;
  let sse       = null;
  let retryTimer = null;

  // ─── Helpers de API ─────────────────────────────────────────────────────
  const BASE = `${GATEWAY_URL}/gateway/webchat/${CHANNEL_ID}`;

  async function apiPost(path, body) {
    const r = await fetch(BASE + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    return r.json();
  }

  async function apiGet(path) {
    const r = await fetch(BASE + path);
    return r.json();
  }

  // ─── Session ID estable (SHA-256 fingerprint) ────────────────────────────
  async function getOrCreateSessionId() {
    // Intentar recuperar de sessionStorage primero
    const stored = sessionStorage.getItem('wchat_sid_' + CHANNEL_ID);
    if (stored) return stored;

    // Construir fingerprint del browser
    const fp = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      CHANNEL_ID,
    ].join('|');

    const data = await apiPost('/session', { fingerprint: fp });
    if (data.ok && data.sessionId) {
      sessionStorage.setItem('wchat_sid_' + CHANNEL_ID, data.sessionId);
      return data.sessionId;
    }
    // Fallback: UUID random local
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    sessionStorage.setItem('wchat_sid_' + CHANNEL_ID, id);
    return id;
  }

  // ─── SSE ────────────────────────────────────────────────────────────────
  function connectSSE() {
    if (sse) sse.close();
    sse = new EventSource(`${BASE}/stream?sessionId=${encodeURIComponent(sessionId)}`);

    sse.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.text) appendMessage('assistant', msg.text, msg.ts);
      } catch {}
    });

    sse.onerror = () => {
      sse.close();
      // Retry exponential backoff capped at 30s
      const delay = Math.min(30_000, (retryTimer?._delay ?? 1000) * 2);
      retryTimer = setTimeout(connectSSE, delay);
      retryTimer._delay = delay;
    };

    sse.onopen = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    };
  }

  // ─── DOM ────────────────────────────────────────────────────────────────
  function buildUI() {
    const posStyle = POSITION === 'left'
      ? 'left:20px;right:auto;'
      : 'right:20px;left:auto;';

    const shadow = document.createElement('div');
    shadow.id = 'wchat-host';
    shadow.style.cssText = `all:initial;position:fixed;bottom:20px;${posStyle}z-index:${Z_INDEX};font-family:system-ui,sans-serif;`;
    document.body.appendChild(shadow);

    const root = shadow.attachShadow({ mode: 'open' });

    root.innerHTML = `
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :host{--p:${PRIMARY};--bg:#fff;--fg:#1a1a1a;--muted:#6b7280;--border:#e5e7eb;--radius:12px;--shadow:0 8px 32px rgba(0,0,0,.16)}

  #bubble{
    width:56px;height:56px;border-radius:50%;background:var(--p);border:none;
    cursor:pointer;display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(0,0,0,.18);transition:transform .18s,box-shadow .18s;
    color:#fff;
  }
  #bubble:hover{transform:scale(1.07);box-shadow:0 8px 24px rgba(0,0,0,.22)}
  #bubble svg{width:26px;height:26px;fill:currentColor}

  #panel{
    position:absolute;bottom:68px;${POSITION==='left'?'left:0':'right:0'};
    width:360px;max-height:560px;display:none;flex-direction:column;
    background:var(--bg);border-radius:var(--radius);box-shadow:var(--shadow);
    overflow:hidden;border:1px solid var(--border);
    animation:slideUp .2s cubic-bezier(.16,1,.3,1);
  }
  @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  #panel.open{display:flex}

  #header{
    background:var(--p);color:#fff;padding:14px 16px;
    display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
  }
  #header h2{font-size:15px;font-weight:600;letter-spacing:-.01em}
  #close-btn{
    background:none;border:none;color:#fff;cursor:pointer;
    opacity:.8;padding:4px;border-radius:4px;line-height:0;
  }
  #close-btn:hover{opacity:1}
  #close-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2}

  #messages{
    flex:1;overflow-y:auto;padding:16px 12px;display:flex;
    flex-direction:column;gap:10px;scroll-behavior:smooth;
  }
  .msg{max-width:82%;padding:10px 13px;border-radius:10px;font-size:14px;line-height:1.5;word-break:break-word}
  .msg.user{align-self:flex-end;background:var(--p);color:#fff;border-bottom-right-radius:3px}
  .msg.assistant{align-self:flex-start;background:#f3f4f6;color:var(--fg);border-bottom-left-radius:3px}
  .msg.typing{opacity:.6;font-style:italic}
  .ts{font-size:11px;opacity:.5;margin-top:3px;text-align:right}

  #input-row{
    display:flex;gap:8px;padding:12px;border-top:1px solid var(--border);flex-shrink:0;
  }
  #msg-input{
    flex:1;border:1px solid var(--border);border-radius:8px;padding:9px 12px;
    font-size:14px;resize:none;outline:none;max-height:100px;line-height:1.4;
    background:var(--bg);color:var(--fg);
  }
  #msg-input:focus{border-color:var(--p)}
  #send-btn{
    background:var(--p);color:#fff;border:none;border-radius:8px;
    width:38px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;
    transition:opacity .15s;
  }
  #send-btn:disabled{opacity:.45;cursor:not-allowed}
  #send-btn svg{width:18px;height:18px;fill:currentColor}

  @media(max-width:420px){
    #panel{width:calc(100vw - 32px);right:0;left:0;bottom:72px}
  }
</style>

<button id="bubble" aria-label="Abrir chat" aria-expanded="false" aria-controls="panel">
  <svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
</button>

<div id="panel" role="dialog" aria-modal="true" aria-label="Chat">
  <div id="header">
    <h2>${escHtml(TITLE)}</h2>
    <button id="close-btn" aria-label="Cerrar chat">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div id="messages" role="log" aria-live="polite" aria-label="Mensajes"></div>
  <div id="input-row">
    <textarea
      id="msg-input"
      placeholder="Escribe un mensaje…"
      rows="1"
      aria-label="Mensaje"
      autocomplete="off"
    ></textarea>
    <button id="send-btn" aria-label="Enviar" disabled>
      <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
    </button>
  </div>
</div>`;

    return root;
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ─── Mensajes en el DOM ──────────────────────────────────────────────────
  let messagesEl, inputEl, sendBtn, bubble, panel;

  function appendMessage(role, text, ts) {
    const div  = document.createElement('div');
    div.className = `msg ${role}`;
    div.setAttribute('role', 'listitem');

    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);

    if (ts) {
      const time = document.createElement('div');
      time.className = 'ts';
      time.textContent = new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      div.appendChild(time);
    }

    // Remove typing indicator if present
    removeTyping();
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showTyping() {
    removeTyping();
    const div = document.createElement('div');
    div.className = 'msg assistant typing';
    div.id = 'wchat-typing';
    div.textContent = '…';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = messagesEl.querySelector('#wchat-typing');
    if (t) t.remove();
  }

  // ─── Envío de mensaje ───────────────────────────────────────────────────
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isLoading) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    isLoading = true;

    appendMessage('user', text, new Date().toISOString());
    showTyping();

    try {
      await apiPost('/message', { sessionId, text });
      // La respuesta llega por SSE — removeTyping() se llama en appendMessage()
    } catch (err) {
      removeTyping();
      appendMessage('assistant', '(Error al enviar el mensaje. Intenta de nuevo.)');
      console.error('[wchat] send error:', err);
    } finally {
      isLoading = false;
      sendBtn.disabled = inputEl.value.trim().length === 0;
    }
  }

  // ─── Abrir / cerrar panel ────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    bubble.setAttribute('aria-expanded', 'true');
    bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>`;
    inputEl.focus();
    connectSSE();
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    bubble.setAttribute('aria-expanded', 'false');
    bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>`;
    if (sse) { sse.close(); sse = null; }
    bubble.focus();
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  async function init() {
    const root = buildUI();
    messagesEl = root.getElementById('messages');
    inputEl    = root.getElementById('msg-input');
    sendBtn    = root.getElementById('send-btn');
    bubble     = root.getElementById('bubble');
    panel      = root.getElementById('panel');

    // Obtener/crear sessionId
    sessionId = await getOrCreateSessionId();

    // Rehidratar historial
    try {
      const hist = await apiGet(`/history?sessionId=${encodeURIComponent(sessionId)}`);
      if (hist.ok && hist.history?.length) {
        hist.history.forEach(h => appendMessage(h.role, h.content, h.ts));
      } else {
        // Mensaje de bienvenida solo si no hay historial
        appendMessage('assistant', WELCOME);
      }
    } catch {
      appendMessage('assistant', WELCOME);
    }

    // ── Eventos ──
    bubble.addEventListener('click', () => isOpen ? closePanel() : openPanel());
    root.getElementById('close-btn').addEventListener('click', closePanel);

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closePanel();
    });

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
      sendBtn.disabled = inputEl.value.trim().length === 0;
    });

    // Enter para enviar (Shift+Enter = nueva línea)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
