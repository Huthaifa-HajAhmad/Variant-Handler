/**
 * Variant Handler — useTheme
 * Manages theme selection with localStorage persistence.
 *
 * Fixes applied:
 *  - Silent catch replaced with console.warn.
 */
import { useState } from 'react';
import { ColorTheme, THEMES } from '../lib/themes';

const STORAGE_KEY      = 'variantstream_theme_id';
const LAST_DARK_KEY    = 'variantstream_last_dark_theme_id';
const DEFAULT_THEME_ID = 'classic-slate';

export function useTheme() {
  const [themeId, setThemeId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  });

  const activeTheme: ColorTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  const selectTheme = (id: string) => {
    setThemeId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  /** Toggles between the last-used dark theme and the light theme. */
  const toggleTheme = () => {
    if (activeTheme.isLight) {
      const prevDark = localStorage.getItem(LAST_DARK_KEY) ?? DEFAULT_THEME_ID;
      selectTheme(prevDark);
    } else {
      localStorage.setItem(LAST_DARK_KEY, themeId);
      const lightTheme = THEMES.find((t) => t.isLight)?.id ?? 'light-clean';
      selectTheme(lightTheme);
    }
  };

  return { themeId, activeTheme, selectTheme, toggleTheme };
}
