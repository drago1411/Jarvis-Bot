/**
 * JARVIS UI — Theme Engine
 */

export type Theme = 'arc-blue' | 'stark-red' | 'stealth-black' | 'matrix-green';

const THEME_KEY = 'jarvis_theme';

export const THEMES: Array<{ id: Theme; name: string; color: string }> = [
  { id: 'arc-blue', name: 'Arc Blue (Stark Tech)', color: '#00d4ff' },
  { id: 'stark-red', name: 'Mark VII (Red & Gold)', color: '#ff3344' },
  { id: 'matrix-green', name: 'Cyberpunk Matrix', color: '#00ff66' },
  { id: 'stealth-black', name: 'Stealth Prototype', color: '#8b949e' },
];

export function initTheme(): void {
  const saved = (localStorage.getItem(THEME_KEY) as Theme) || 'arc-blue';
  setTheme(saved);
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function getCurrentTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || 'arc-blue';
}
