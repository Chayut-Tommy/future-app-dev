import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ColorTokens, darkColors, lightColors, radius, spacing, typography, minTouchTarget } from './tokens';
import { ThemePreference } from '../types/models';
import { useAppState } from '../state/AppStateContext';

interface ThemeContextValue {
  colors: ColorTokens;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  minTouchTarget: number;
  cardShadow: object;
  /** Soft, ambient colored glow — ~Apple Intelligence / Linear reference,
   * ~not a heavy drop shadow. Use behind AI/hero/milestone surfaces. */
  glow: (color: string) => object;
  /** Lulu's single AI identity color — resolves to purple or Ocean Blue
   * depending on the user's Settings > "Lulu Score card style" choice.
   * Every AI-branded surface (Talk to Lulu, sparkle icons, Lulu cards, AI
   * highlights/buttons/accent text) should read from this instead of
   * `colors.purple` directly, so the two themes never mix (PRD ask). */
  aiAccentColor: string;
  aiAccentSoft: string;
  onAiAccent: string;
  aiCardGradient: [string, string];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { data, updateUser } = useAppState();
  const preference = data.user.theme ?? 'system';

  const scheme: 'light' | 'dark' = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;
  // Ocean Blue is the default AI identity — calmer and more "wealth
  // navigator" than the original purple, which remains fully selectable in
  // Settings (PRD ask: only the default changes, not the picker itself).
  const isBlueAi = (data.user.luluCardTheme ?? 'blue') === 'blue';
  const aiAccentColor = isBlueAi ? colors.aiBlue : colors.purple;
  const aiAccentSoft = isBlueAi ? colors.aiBlueSoft : colors.purpleSoft;
  const onAiAccent = isBlueAi ? colors.onAiBlue : colors.onPurple;
  const aiCardGradient = isBlueAi ? colors.aiGradientBlue : colors.aiGradient;

  const cardShadow = useMemo(
    () =>
      scheme === 'dark'
        ? { borderWidth: 0.5, borderColor: colors.border }
        : {
            shadowColor: '#0B1220',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.06,
            shadowRadius: 16,
          },
    [scheme, colors.border]
  );

  const glow = useMemo(
    () => (color: string) => ({
      shadowColor: color,
      shadowOffset: { width: 0, height: scheme === 'dark' ? 0 : 8 },
      shadowOpacity: scheme === 'dark' ? 0.35 : 0.18,
      shadowRadius: 24,
      elevation: 0,
    }),
    [scheme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      scheme,
      preference,
      setPreference: (pref: ThemePreference) => updateUser({ theme: pref }),
      spacing,
      radius,
      typography,
      minTouchTarget,
      cardShadow,
      glow,
      aiAccentColor,
      aiAccentSoft,
      onAiAccent,
      aiCardGradient,
    }),
    [colors, scheme, preference, updateUser, cardShadow, glow, aiAccentColor, aiAccentSoft, onAiAccent, aiCardGradient]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
