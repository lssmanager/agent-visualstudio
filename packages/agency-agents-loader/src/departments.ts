// ─────────────────────────────────────────────────────────────────────────────
// departments.ts — static metadata for each department directory
//
// 14 departments derived from msitarzewski/agency-agents repo structure.
// Colors chosen to match the studio's design system palette.
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentMeta {
  name: string;
  color: string;
  emoji: string;
}

export const DEPARTMENTS_META: Record<string, DepartmentMeta> = {
  academic: {
    name: 'Academic',
    color: '#7c3aed',
    emoji: '🎓',
  },
  design: {
    name: 'Design',
    color: '#ec4899',
    emoji: '🎨',
  },
  engineering: {
    name: 'Engineering',
    color: '#2563eb',
    emoji: '⚙️',
  },
  finance: {
    name: 'Finance',
    color: '#16a34a',
    emoji: '💹',
  },
  'game-development': {
    name: 'Game Development',
    color: '#9333ea',
    emoji: '🎮',
  },
  integrations: {
    name: 'Integrations',
    color: '#0891b2',
    emoji: '🔌',
  },
  marketing: {
    name: 'Marketing',
    color: '#f59e0b',
    emoji: '📣',
  },
  'paid-media': {
    name: 'Paid Media',
    color: '#dc2626',
    emoji: '📈',
  },
  product: {
    name: 'Product',
    color: '#0d9488',
    emoji: '🧩',
  },
  'project-management': {
    name: 'Project Management',
    color: '#d97706',
    emoji: '📋',
  },
  sales: {
    name: 'Sales',
    color: '#059669',
    emoji: '🤝',
  },
  'spatial-computing': {
    name: 'Spatial Computing',
    color: '#6366f1',
    emoji: '🥽',
  },
  specialized: {
    name: 'Specialized',
    color: '#64748b',
    emoji: '🔬',
  },
  strategy: {
    name: 'Strategy',
    color: '#b45309',
    emoji: '♟️',
  },
  support: {
    name: 'Support',
    color: '#0284c7',
    emoji: '🛎️',
  },
  testing: {
    name: 'Testing',
    color: '#be185d',
    emoji: '🧪',
  },
};
