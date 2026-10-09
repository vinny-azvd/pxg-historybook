// Skin registry. Pure data + DOM helpers (no React) so main.tsx can apply the
// stored skin before React renders and avoid a flash of the wrong look.

export type Skin = 'classic' | 'gameboy' | 'battle' | 'cards';

export interface SkinInfo {
  id: Skin;
  label: string;
  description: string;
  /** Fixed colour scheme, or null when it follows the system (Classic). */
  scheme: 'light' | 'dark' | null;
}

export const SKINS: readonly SkinInfo[] = [
  {
    id: 'classic',
    label: 'Clássico',
    description: 'O visual original, claro ou escuro conforme o sistema.',
    scheme: null,
  },
  {
    id: 'gameboy',
    label: 'Game Boy',
    description: 'Tela verde de quatro tons e menu START.',
    scheme: 'light',
  },
  {
    id: 'battle',
    label: 'Batalha',
    description: 'Azul e vermelho, com a arena da melhor hunt.',
    scheme: 'light',
  },
  {
    id: 'cards',
    label: 'Cartas',
    description: 'Feltro verde escuro e molduras douradas.',
    scheme: 'dark',
  },
];

export const DEFAULT_SKIN: Skin = 'battle';
export const SKIN_STORAGE_KEY = 'pxg-hunts:skin';

export function isSkin(value: unknown): value is Skin {
  return typeof value === 'string' && SKINS.some((s) => s.id === value);
}

export function readStoredSkin(): Skin {
  try {
    const raw = localStorage.getItem(SKIN_STORAGE_KEY);
    if (isSkin(raw)) return raw;
  } catch {
    // storage blocked (private mode, etc.): fall through to the default
  }
  return DEFAULT_SKIN;
}

export function storeSkin(skin: Skin): void {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // ignore storage errors
  }
}

/** Writes html[data-skin] and html[data-type-surface] (none for Classic). */
export function applySkin(skin: Skin): void {
  const root = document.documentElement;
  const info = SKINS.find((s) => s.id === skin) ?? SKINS[0];
  root.setAttribute('data-skin', info.id);
  if (info.scheme) root.setAttribute('data-type-surface', info.scheme);
  else root.removeAttribute('data-type-surface');
}

/** Early call for main.tsx: apply the stored (or default) skin and return it. */
export function initSkin(): Skin {
  const skin = readStoredSkin();
  applySkin(skin);
  return skin;
}
