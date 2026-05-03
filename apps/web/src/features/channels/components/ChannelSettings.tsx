/**
 * ChannelSettings.tsx — [F5-05]
 *
 * Formulario de configuración de un canal existente.
 * Cubre: Telegram, WhatsApp (Meta Cloud API), WhatsApp (Baileys QR),
 *        Slack, Discord, Teams, Webchat, Webhook.
 * Montado dentro de ChannelDetail.tsx como pestaña "Configuración".
 */

import React, { useCallback, useId, useReducer, useState } from 'react';
import type {
  ChannelConfig,
  ChannelType,
  PatchChannelPayload,
  ChannelTestResult,
} from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ChannelSettingsProps {
  channel:    ChannelConfig;
  gatewayUrl: string;
  onSave:     (id: string, payload: PatchChannelPayload) => Promise<void>;
  onTest:     (id: string) => Promise<ChannelTestResult>;
}

interface FormState {
  name:    string;
  config:  Record<string, string>;
  secrets: Record<string, string>;
  dirty:   boolean;
}

type FormAction =
  | { type: 'SET_NAME';   value: string }
  | { type: 'SET_CONFIG'; key: string; value: string }
  | { type: 'SET_SECRET'; key: string; value: string }
  | { type: 'RESET';      channel: ChannelConfig };

// ── Definición de campos por tipo ─────────────────────────────────────────────

interface FieldDef {
  key:         string;
  label:       string;
  placeholder: string;
  type:        'text' | 'password' | 'select' | 'tags' | 'number' | 'boolean';
  options?:    { value: string; label: string }[];
  hint?:       string;
  readOnly?:   boolean;
  devOnly?:    boolean;
}

const CONFIG_FIELDS: Partial<Record<ChannelType, FieldDef[]>> = {
  telegram: [
    {
      key:         'webhookMode',
      label:       'Modo de recepción',
      placeholder: '',
      type:        'select',
      options: [
        { value: 'polling', label: 'Long polling (desarrollo)' },
        { value: 'webhook', label: 'Webhook HTTPS (producción)' },
      ],
      hint: 'Usa "webhook" en producción. El bot no puede recibir mensajes si el polling y el webhook están activos a la vez.',
    },
    {
      key:         'parseMode',
      label:       'Modo de formato',
      placeholder: '',
      type:        'select',
      options: [
        { value: 'HTML',       label: 'HTML' },
        { value: 'MarkdownV2', label: 'Markdown V2 (recomendado)' },
        { value: 'Markdown',   label: 'Markdown (legacy)' },
      ],
    },
    {
      key:         'allowedUserIds',
      label:       'User IDs permitidos',
      placeholder: '123456789, 987654321 (vacío = todos)',
      type:        'tags',
      hint:        'IDs numéricos de Telegram separados por coma. Vacío permite todos los usuarios.',
    },
  ],

  // WhatsApp Meta Cloud API
  whatsapp: [
    {
      key:         'verifyToken',
      label:       'Verify Token (webhook)',
      placeholder: 'mi-token-secreto',
      type:        'text',
      hint:        'Debe coincidir con el valor en el dashboard de Meta Business.',
    },
    {
      key:         'apiVersion',
      label:       'Versión de la API de Meta',
      placeholder: 'v18.0',
      type:        'text',
      hint:        'Formato: v18.0, v19.0, etc.',
    },
    {
      key:         'phoneId',
      label:       'Phone Number ID',
      placeholder: '1234567890',
      type:        'text',
      hint:        'ID del número en Meta Business. Visible en Meta Developers → WhatsApp → Getting Started.',
    },
    {
      key:         'allowedPhoneNumbers',
      label:       'Números permitidos (test)',
      placeholder: '+34612345678, +1234567890 (vacío = todos)',
      type:        'tags',
      hint:        'En producción, deja vacío. En desarrollo, restringe a números de prueba.',
    },
  ],

  // WhatsApp Baileys (QR pairing — sin token, sin secrets)
  'whatsapp-baileys': [
    {
      key:         'maxReconnectAttempts',
      label:       'Máximo de reconexiones',
      placeholder: '8',
      type:        'number',
      hint:        'Número de veces que Baileys intenta reconectarse antes de considerar la sesión caída. Recomendado: 8.',
    },
    {
      key:         'qrTimeoutMs',
      label:       'Tiempo de espera del QR (ms)',
      placeholder: '120000',
      type:        'number',
      hint:        'Tiempo en milisegundos antes de que el QR expire. Por defecto: 120000 (2 minutos).',
    },
    {
      key:         'printQrInTerminal',
      label:       'Imprimir QR en terminal',
      placeholder: '',
      type:        'boolean',
      hint:        'Solo útil en entornos de desarrollo local. Deshabilitar en producción.',
      devOnly:     true,
    },
  ],

  // Slack Bolt
  slack: [
    {
      key:         'workspaceName',
      label:       'Nombre del workspace (referencia)',
      placeholder: 'Mi empresa',
      type:        'text',
      hint:        'Texto libre para identificar el workspace de Slack. No se envía a la API.',
    },
    {
      key:         'botDisplayName',
      label:       'Nombre del bot en Slack',
      placeholder: 'Mi agente',
      type:        'text',
      hint:        'Nombre visible del bot en los chats de Slack.',
    },
  ],

  discord: [
    {
      key:         'applicationId',
      label:       'Application ID',
      placeholder: '1234567890123456789',
      type:        'text',
      hint:        'Discord Developer Portal → General Information → Application ID.',
    },
    {
      key:         'guildId',
      label:       'Guild ID por defecto (opcional)',
      placeholder: '1234567890123456789',
      type:        'text',
      hint:        'Si se rellena, los slash commands se registran solo en este servidor. Vacío = commands globales.',
    },
    {
      key:         'commandPrefix',
      label:       'Prefijo de comandos',
      placeholder: '/',
      type:        'text',
      hint:        'Normalmente "/" — solo cambiar para entornos de test.',
    },
  ],

  teams: [
    {
      key:         'tenantId',
      label:       'Azure AD Tenant ID',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      type:        'text',
      hint:        'Azure Portal → Azure Active Directory → Properties → Tenant ID.',
    },
    {
      key:         'appId',
      label:       'Microsoft App ID',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      type:        'text',
      hint:        'Azure Bot Service → Configuration → Microsoft App ID.',
    },
    {
      key:         'serviceMode',
      label:       'Modo de servicio',
      placeholder: '',
      type:        'select',
      options: [
        { value: 'bot_framework',    label: 'Bot Framework (recibe actividades)' },
        { value: 'incoming_webhook', label: 'Incoming Webhook (solo envía)' },
      ],
      hint: '"Bot Framework" permite conversaciones bidireccionales. "Incoming Webhook" solo envía cards a un canal Teams.',
    },
    {
      key:         'webhookUrl',
      label:       'Webhook URL de Teams (solo Incoming Webhook)',
      placeholder: 'https://contoso.webhook.office.com/webhookb2/...',
      type:        'text',
      hint:        'Teams → canal → Connectors → Incoming Webhook → URL.',
    },
    {
      key:         'welcomeMessage',
      label:       'Mensaje de bienvenida',
      placeholder: '¡Hola! Soy tu agente de soporte.',
      type:        'text',
      hint:        'Se envía automáticamente cuando el bot es instalado en un equipo.',
    },
  ],
};

const SECRET_ROTATE_FIELDS: Partial<Record<ChannelType | 'whatsapp-baileys', FieldDef[]>> = {
  telegram: [
    {
      key:         'botToken',
      label:       'Bot Token',
      placeholder: 'Dejar vacío para no cambiar · 123456:ABC...',
      type:        'password',
      hint:        '@BotFather → /token. Rotarlo invalida el token anterior inmediatamente.',
    },
  ],
  whatsapp: [
    {
      key:         'token',
      label:       'API Token (Bearer)',
      placeholder: 'Dejar vacío para no cambiar',
      type:        'password',
      hint:        'Meta Business → System Users → Generate Token.',
    },
  ],
  // whatsapp-baileys: no tiene secrets — usa QR
  'whatsapp-baileys': [],
  slack: [
    {
      key:         'botToken',
      label:       'Bot Token',
      placeholder: 'Dejar vacío para no cambiar · xoxb-...',
      type:        'password',
      hint:        'Slack API → OAuth & Permissions → Bot User OAuth Token. Empieza con xoxb-.',
    },
    {
      key:         'signingSecret',
      label:       'Signing Secret',
      placeholder: 'Dejar vacío para no cambiar',
      type:        'password',
      hint:        'Slack API → Basic Information → App Credentials → Signing Secret.',
    },
    {
      key:         'appToken',
      label:       'App-Level Token (Socket Mode, opcional)',
      placeholder: 'Dejar vacío para no cambiar · xapp-...',
      type:        'password',
      hint:        'Solo necesario si usas Socket Mode. Slack API → Basic Information → App-Level Tokens. Empieza con xapp-.',
    },
  ],
  discord: [
    {
      key:         'botToken',
      label:       'Bot Token',
      placeholder: 'Dejar vacío para no cambiar · MTk...',
      type:        'password',
      hint:        'Discord Developer Portal → Bot → Reset Token.',
    },
    {
      key:         'publicKey',
      label:       'Public Key (verificación Ed25519)',
      placeholder: 'Dejar vacío para no cambiar · hex string',
      type:        'password',
      hint:        'Discord Developer Portal → General Information → Public Key. Requerido para verificar interacciones entrantes.',
    },
    {
      key:         'clientSecret',
      label:       'Client Secret (opcional)',
      placeholder: 'Dejar vacío para no cambiar',
      type:        'password',
      hint:        'Discord Developer Portal → OAuth2 → Client Secret. Solo necesario para OAuth2 flows.',
    },
  ],
  teams: [
    {
      key:         'clientSecret',
      label:       'Client Secret (Azure)',
      placeholder: 'Dejar vacío para no cambiar',
      type:        'password',
      hint:        'Azure Portal → App Registrations → Certificates & Secrets → New client secret.',
    },
    {
      key:         'appPassword',
      label:       'App Password (Bot Framework)',
      placeholder: 'Dejar vacío para no cambiar',
      type:        'password',
      hint:        'Azure Bot Service → Configuration → Microsoft App Password.',
    },
  ],
};

// Determina si el tipo es whatsapp-baileys (authMode=qr en config)
function isWhatsAppBaileys(channel: ChannelConfig): boolean {
  return (
    channel.type === 'whatsapp' &&
    (channel.config?.['authMode'] === 'qr' || channel.config?.['provider'] === 'baileys')
  );
}

// Resuelve la clave de campos según el subtipo
function resolveFieldsKey(channel: ChannelConfig): ChannelType | 'whatsapp-baileys' {
  if (isWhatsAppBaileys(channel)) return 'whatsapp-baileys';
  return channel.type;
}

// ── Reducer ────────────────────────────────────────────────────────────────────

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.value, dirty: true };
    case 'SET_CONFIG':
      return {
        ...state,
        config: { ...state.config, [action.key]: action.value },
        dirty:  true,
      };
    case 'SET_SECRET':
      return {
        ...state,
        secrets: { ...state.secrets, [action.key]: action.value },
        dirty:   true,
      };
    case 'RESET':
      return initFormState(action.channel);
  }
}

function initFormState(channel: ChannelConfig): FormState {
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(channel.config ?? {})) {
    if (Array.isArray(v)) {
      config[k] = (v as string[]).join(', ');
    } else {
      config[k] = String(v ?? '');
    }
  }
  return { name: channel.name, config, secrets: {}, dirty: false };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildPatchPayload(state: FormState, originalChannel: ChannelConfig): PatchChannelPayload {
  const payload: PatchChannelPayload = {};
  const fieldsKey = resolveFieldsKey(originalChannel);

  if (state.name.trim() !== originalChannel.name) {
    payload.name = state.name.trim();
  }

  const configFields = CONFIG_FIELDS[fieldsKey as ChannelType] ?? [];
  const newConfig: Record<string, unknown> = {};
  let configChanged = false;
  for (const field of configFields) {
    const value = state.config[field.key] ?? '';
    if (field.type === 'tags') {
      const arr = value.split(',').map(s => s.trim()).filter(Boolean);
      newConfig[field.key] = arr;
      const orig = originalChannel.config[field.key];
      if (JSON.stringify(arr) !== JSON.stringify(orig)) configChanged = true;
    } else if (field.type === 'number') {
      const num = value === '' ? undefined : Number(value);
      newConfig[field.key] = num;
      if (num !== originalChannel.config[field.key]) configChanged = true;
    } else if (field.type === 'boolean') {
      const bool = value === 'true';
      newConfig[field.key] = bool;
      if (bool !== originalChannel.config[field.key]) configChanged = true;
    } else {
      newConfig[field.key] = value;
      if (value !== String(originalChannel.config[field.key] ?? '')) configChanged = true;
    }
  }
  if (configChanged) payload.config = newConfig;

  const nonEmptySecrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.secrets)) {
    if (v.trim()) nonEmptySecrets[k] = v.trim();
  }
  if (Object.keys(nonEmptySecrets).length > 0) {
    payload.secrets = nonEmptySecrets;
  }

  return payload;
}

function getWebhookUrl(gatewayUrl: string, channelId: string, channelType: ChannelType, isBaileys: boolean): string {
  if (isBaileys) return ''; // WhatsApp Baileys no tiene webhook URL
  const base = gatewayUrl.replace(/\/$/, '');
  const paths: Partial<Record<ChannelType, string>> = {
    telegram: `/gateway/telegram/${channelId}/webhook`,
    whatsapp: `/gateway/whatsapp/${channelId}/webhook`,
    slack:    `/channels/slack/${channelId}/events`,
    discord:  `/channels/discord/${channelId}/interactions`,
    teams:    `/channels/teams/${channelId}/messages`,
    webhook:  `/gateway/webhook/${channelId}`,
    webchat:  `/embed/${channelId}`,
  };
  return paths[channelType] ? `${base}${paths[channelType]}` : '';
}

// ── Componentes internos ───────────────────────────────────────────────────────

function WebhookUrlRow({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  if (!url) return null;

  return (
    <div className="channel-settings__webhook-row">
      <span className="channel-settings__webhook-label">{label ?? 'Webhook URL'}</span>
      <div className="channel-settings__webhook-value">
        <code className="channel-settings__webhook-url">{url}</code>
        <button
          type="button"
          className="channel-settings__copy-btn"
          onClick={copy}
          aria-label="Copiar URL"
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="channel-settings__webhook-hint">
        Configura esta URL en el proveedor del canal como endpoint de webhook.
      </p>
    </div>
  );
}

/** Badge especial para WhatsApp Baileys — indica que no usa secrets */
function BaileysNoSecretsBadge() {
  return (
    <div className="channel-settings__baileys-badge" role="note">
      <span className="channel-settings__baileys-badge-icon" aria-hidden="true">📱</span>
      <div>
        <strong className="channel-settings__baileys-badge-title">Autenticación por QR — sin credenciales</strong>
        <p className="channel-settings__baileys-badge-desc">
          WhatsApp Baileys usa sesiones QR persistentes almacenadas en el servidor.
          No requiere tokens ni API keys. Usa el botón «Vincular WhatsApp» para generar un QR.
        </p>
      </div>
    </div>
  );
}

interface TestResultBannerProps {
  result:  ChannelTestResult | null;
  testing: boolean;
}
function TestResultBanner({ result, testing }: TestResultBannerProps) {
  if (testing) {
    return (
      <div className="channel-settings__test-banner channel-settings__test-banner--testing">
        <span className="channel-settings__test-spinner" aria-hidden />
        Probando conexión…
      </div>
    );
  }
  if (!result) return null;
  return (
    <div
      className={[
        'channel-settings__test-banner',
        result.ok
          ? 'channel-settings__test-banner--ok'
          : 'channel-settings__test-banner--error',
      ].join(' ')}
      role="status"
    >
      {result.ok
        ? `✓ Conexión OK · ${result.latency}ms · ${result.message}`
        : `✗ ${result.message}`}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field:    FieldDef;
  value:    string;
  onChange: (v: string) => void;
}) {
  const id = useId();

  if (field.type === 'select') {
    return (
      <div className="channel-settings__field">
        <label htmlFor={id} className="channel-settings__label">{field.label}</label>
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="channel-settings__select"
          disabled={field.readOnly}
        >
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {field.hint && <p className="channel-settings__hint">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="channel-settings__field channel-settings__field--boolean">
        <label className="channel-settings__label-checkbox">
          <input
            id={id}
            type="checkbox"
            checked={value === 'true'}
            onChange={e => onChange(e.target.checked ? 'true' : 'false')}
            className="channel-settings__checkbox"
            disabled={field.readOnly}
          />
          <span>{field.label}</span>
          {field.devOnly && (
            <span className="channel-settings__dev-badge" title="Solo desarrollo">DEV</span>
          )}
        </label>
        {field.hint && <p className="channel-settings__hint">{field.hint}</p>}
      </div>
    );
  }

  return (
    <div className="channel-settings__field">
      <label htmlFor={id} className="channel-settings__label">{field.label}</label>
      <input
        id={id}
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="channel-settings__input"
        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
        readOnly={field.readOnly}
        min={field.type === 'number' ? 0 : undefined}
      />
      {field.hint && <p className="channel-settings__hint">{field.hint}</p>}
    </div>
  );
}

// Etiqueta de webhook URL según tipo
function webhookUrlLabel(channelType: ChannelType): string {
  switch (channelType) {
    case 'slack':    return 'Events URL (configurar en Slack API)';
    case 'discord':  return 'Interactions Endpoint URL (configurar en Discord Dev Portal)';
    case 'teams':    return 'Bot Messaging Endpoint (configurar en Azure Bot Service)';
    case 'webchat':  return 'Embed URL (incrustar en tu web)';
    default:         return 'Webhook URL';
  }
}

// ── Componente principal ───────────────────────────────────────────────────────

export function ChannelSettings({ channel, gatewayUrl, onSave, onTest }: ChannelSettingsProps) {
  const [state,      dispatch]     = useReducer(formReducer, channel, initFormState);
  const [saving,     setSaving]    = useState(false);
  const [testing,    setTesting]   = useState(false);
  const [saveErr,    setSaveErr]   = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ChannelTestResult | null>(null);

  const baileys      = isWhatsAppBaileys(channel);
  const fieldsKey    = resolveFieldsKey(channel);
  const configFields = CONFIG_FIELDS[fieldsKey as ChannelType] ?? [];
  const secretFields = (SECRET_ROTATE_FIELDS as Record<string, FieldDef[]>)[fieldsKey] ?? [];
  const webhookUrl   = getWebhookUrl(gatewayUrl, channel.id, channel.type, baileys);

  React.useEffect(() => {
    dispatch({ type: 'RESET', channel });
    setSaveErr(null);
    setTestResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!state.dirty) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const payload = buildPatchPayload(state, channel);
      await onSave(channel.id, payload);
      dispatch({ type: 'RESET', channel: { ...channel, ...payload } });
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(channel.id);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  if (configFields.length === 0 && secretFields.length === 0 && !baileys) {
    return (
      <div className="channel-settings channel-settings--empty">
        <p className="channel-settings__no-fields">
          Este tipo de canal no tiene configuración adicional editable.
        </p>
        <WebhookUrlRow url={webhookUrl} label={webhookUrlLabel(channel.type)} />
      </div>
    );
  }

  return (
    <section className="channel-settings" aria-label={`Configuración del canal ${channel.name}`}>
      {/* Header */}
      <div className="channel-settings__header">
        <ChannelTypeIcon type={channel.type} size={24} />
        <div>
          <h3 className="channel-settings__channel-name">{channel.name}</h3>
          <span className="channel-settings__type-badge">
            {baileys ? 'whatsapp-baileys' : channel.type}
          </span>
        </div>
        <span
          className={[
            'channel-settings__status',
            channel.isActive
              ? 'channel-settings__status--active'
              : 'channel-settings__status--inactive',
          ].join(' ')}
          aria-label={channel.isActive ? 'Activo' : 'Inactivo'}
        >
          {channel.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Badge especial WhatsApp Baileys */}
      {baileys && <BaileysNoSecretsBadge />}

      {/* Webhook URL */}
      <WebhookUrlRow url={webhookUrl} label={webhookUrlLabel(channel.type)} />

      {/* Test de conexión */}
      <div className="channel-settings__test-row">
        <button
          type="button"
          className="channel-settings__test-btn"
          onClick={() => void handleTest()}
          disabled={testing || saving}
          aria-busy={testing}
        >
          {testing ? 'Probando…' : '⚡ Test de conexión'}
        </button>
        <TestResultBanner result={testResult} testing={testing} />
      </div>

      {/* Formulario */}
      <form
        onSubmit={e => void handleSave(e)}
        className="channel-settings__form"
        aria-label="Formulario de configuración"
        noValidate
      >
        {/* Nombre */}
        <div className="channel-settings__field">
          <label htmlFor="cs-name" className="channel-settings__label">Nombre del canal</label>
          <input
            id="cs-name"
            type="text"
            value={state.name}
            onChange={e => dispatch({ type: 'SET_NAME', value: e.target.value })}
            className="channel-settings__input"
            placeholder="Nombre descriptivo"
          />
        </div>

        {/* Config pública */}
        {configFields.length > 0 && (
          <fieldset className="channel-settings__fieldset">
            <legend className="channel-settings__legend">Configuración</legend>
            {configFields.map(field => (
              <FieldInput
                key={field.key}
                field={field}
                value={state.config[field.key] ?? (field.type === 'boolean' ? 'false' : '')}
                onChange={v => dispatch({ type: 'SET_CONFIG', key: field.key, value: v })}
              />
            ))}
          </fieldset>
        )}

        {/* Rotación de secrets (oculto para Baileys) */}
        {!baileys && secretFields.length > 0 && (
          <fieldset className="channel-settings__fieldset">
            <legend className="channel-settings__legend">
              Credenciales
              <span className="channel-settings__secret-hint"> — deja vacío para conservar el valor actual</span>
            </legend>
            {secretFields.map(field => (
              <FieldInput
                key={field.key}
                field={field}
                value={state.secrets[field.key] ?? ''}
                onChange={v => dispatch({ type: 'SET_SECRET', key: field.key, value: v })}
              />
            ))}
          </fieldset>
        )}

        {saveErr && (
          <p className="channel-settings__error" role="alert">{saveErr}</p>
        )}

        <div className="channel-settings__footer">
          <button
            type="button"
            className="channel-settings__btn-reset"
            onClick={() => dispatch({ type: 'RESET', channel })}
            disabled={!state.dirty || saving}
          >
            Descartar cambios
          </button>
          <button
            type="submit"
            className="channel-settings__btn-save"
            disabled={!state.dirty || saving}
            aria-busy={saving}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </section>
  );
}
