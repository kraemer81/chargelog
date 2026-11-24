import type { ThemePreference } from './store/store';

/**
 * Applies the theme preference to the document. "system" removes the
 * attribute so that the CSS falls back to prefers-color-scheme.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}
