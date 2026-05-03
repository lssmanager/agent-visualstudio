/**
 * ChannelTypeIcon.tsx — [F5-05]
 *
 * Icono de canal con logos de marca reales via cdn.simpleicons.org.
 * Telegram, WhatsApp, Slack, Discord, Teams → imagen con color de marca.
 * webchat y webhook → SVG inline con currentColor.
 */
import React from 'react';
import type { ChannelType } from '../types';

interface Props {
  type:       ChannelType;
  size?:      number;
  className?: string;
}

/** Logos de marca con color oficial */
const BRAND: Partial<Record<ChannelType, { url: string; color: string; label: string }>> = {
  telegram: { url: 'https://cdn.simpleicons.org/telegram/26A5E4',          color: '#26A5E4', label: 'Telegram' },
  whatsapp: { url: 'https://cdn.simpleicons.org/whatsapp/25D366',          color: '#25D366', label: 'WhatsApp' },
  slack:    { url: 'https://cdn.simpleicons.org/slack/4A154B',             color: '#4A154B', label: 'Slack' },
  discord:  { url: 'https://cdn.simpleicons.org/discord/5865F2',          color: '#5865F2', label: 'Discord' },
  teams:    { url: 'https://cdn.simpleicons.org/microsoftteams/6264A7',    color: '#6264A7', label: 'Microsoft Teams' },
};

/** SVGs inline para tipos sin logo externo */
function WebchatIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function WebhookIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function ChannelTypeIcon({ type, size = 20, className }: Props) {
  const brand = BRAND[type];

  if (brand) {
    return (
      <img
        src={brand.url}
        width={size}
        height={size}
        alt={brand.label}
        className={className}
        loading="lazy"
        aria-hidden="true"
        style={{ display: 'inline-block', flexShrink: 0 }}
      />
    );
  }

  if (type === 'webchat') {
    return <WebchatIcon size={size} className={className} />;
  }

  // webhook y cualquier tipo desconocido
  return <WebhookIcon size={size} className={className} />;
}
