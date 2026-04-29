/**
 * EmbedSnippet.tsx
 * Muestra el snippet <script> listo para copiar cuando el canal es webchat y está activo.
 */
import React, { useState } from 'react';

interface Props {
  channelId:   string;
  gatewayUrl?: string;
  title?:      string;
}

export function EmbedSnippet({ channelId, gatewayUrl, title = 'Asistente' }: Props) {
  const base = gatewayUrl ??
    (typeof window !== 'undefined' ? window.location.origin : 'https://your-gateway.com');

  const snippet = `<script
  src="${base}/webchat-widget.js"
  data-channel-id="${channelId}"
  data-gateway-url="${base}"
  data-title="${title}"
></script>`;

  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="embed-snippet">
      <div className="embed-snippet__header">
        <span className="embed-snippet__label">📎 Snippet de embedido</span>
        <button
          className="embed-snippet__copy"
          onClick={copy}
          aria-label="Copiar snippet"
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="embed-snippet__code">
        <code>{snippet}</code>
      </pre>
      <p className="embed-snippet__hint">
        Pega este script en el <code>&lt;body&gt;</code> de tu sitio web.
      </p>
    </div>
  );
}
