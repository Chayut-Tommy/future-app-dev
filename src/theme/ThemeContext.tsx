import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ColorTokens, darkColors, lightColors, radius, spacing, typography, minTouchTarget } from './tokens';
import { NaviloColorStyle, NaviloPalette, selectNaviloPalette } from './palettes';
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
  /** Lulu's single AI identity color — resolves to Ocean Blue, Purple, or
   * Sunrise depending on the user's Settings > "Navilo colour style"
   * choice (Pass 2B correction — extended from a two-way switch to three).
   * Every AI-branded surface (Talk to Lulu, sparkle icons, Lulu cards, AI
   * highlights/buttons/accent text) should read from this instead of
   * `colors.purple`/`colors.aiBlue` directly, so the styles never mix (PRD
   * ask). Unrelated to `naviloPalette` below — this stays at its original
   * vivid intensity for the surfaces that already used it (WelcomeFlow,
   * MoneyOpportunitiesHero, ProfileNudgeCard, FloatingLuluButton,
   * AskLuluSheet); `naviloPalette` is the separate, additional token set
   * the Today Briefing hero/tiles/AI insight banner read instead, tuned
   * specifically for that composition (translucent tiles, a muted insight
   * banner, attention/progress tokens) — see palettes.ts's own doc
   * comment for why these are deliberately two token sets, not one. */
  aiAccentColor: string;
  aiAccentSoft: string;
  onAiAccent: string;
  aiCardGradient: [string, string];
  /** The selected Navilo colour style itself, exposed directly for any
   * consumer that needs the raw enum (e.g. tests, or a future consumer
   * that branches on style rather than reading a resolved colour). */
  naviloColorStyle: NaviloColorStyle;
  /** The full central semantic palette (Pass 2B correction §5) — hero
   * gradient, tile surface/border, primary/secondary accent, AI insight
   * surface/foreground, attention accent, progress accent — already
   * resolved for the current style AND the current light/dark scheme. See
   * palettes.ts for the complete mapping. */
  naviloPalette: NaviloPalette;
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
  // Pass 2B correction — extended from a two-way (blue/purple) switch to
  // three (blue/purple/sunrise); system appearance (`scheme`, above)
  // continues to control light vs dark independently of this choice.
  const naviloColorStyle: NaviloColorStyle = data.user.luluCardTheme ?? 'blue';
  const aiAccentColor = naviloColorStyle === 'blue' ? colors.aiBlue : naviloColorStyle === 'purple' ? colors.purple : colors.sunrise;
  const aiAccentSoft = naviloColorStyle === 'blue' ? colors.aiBlueSoft : naviloColorStyle === 'purple' ? colors.purpleSoft : colors.sunriseSoft;
  const onAiAccent = naviloColorStyle === 'blue' ? colors.onAiBlue : naviloColorStyle === 'purple' ? colors.onPurple : colors.onSunrise;
  const aiCardGradient = naviloColorStyle === 'blue' ? colors.aiGradientBlue : naviloColorStyle === 'purple' ? colors.aiGradient : colors.sunriseGradient;
  const naviloPalette = useMemo(() => selectNaviloPalette(naviloColorStyle, scheme, colors), [naviloColorStyle, scheme, colors]);

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
      naviloColorStyle,
      naviloPalette,
    }),
    [colors, scheme, preference, updateUser, cardShadow, glow, aiAccentColor, aiAccentSoft, onAiAccent, aiCardGradient, naviloColorStyle, naviloPalette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
