export interface ColorTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  secondary: string;
  secondarySoft: string;
  success: string;
  successSoft: string;
  /** A distinctly brighter green than `accent` — used only where two green
   * bands need to read as different at a glance (e.g. the Lulu Score ring's
   * "Building good habits" vs "Growing strong" tiers). */
  successBright: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  onAccent: string;
  // Premium finance identity (§ premium color system):
  navy: string; // trust, important numbers
  navySoft: string;
  onNavy: string;
  purple: string; // Lulu AI intelligence (Purple theme)
  purpleSoft: string;
  onPurple: string;
  /** Lulu AI intelligence (Ocean Blue theme) — the solid counterpart to
   * purple, used everywhere purple would be used for AI identity when the
   * user has selected the Ocean Blue Lulu Score style. Never mixed with
   * purple within one session — see `aiAccentColor` on ThemeContext, which
   * resolves to whichever of these two is currently active. */
  aiBlue: string;
  aiBlueSoft: string;
  onAiBlue: string;
  market: string; // market data / investment insights
  marketSoft: string;
  gold: string; // achievements, milestones
  goldSoft: string;
  onGold: string;
  // Gradient pairs for hero surfaces
  heroGradient: [string, string];
  aiGradient: [string, string];
  /** Alternate Lulu Check-in card theme — deep navy to aqua/cyan, "premium
   * wealth assistant" instead of the purple "AI companion" feel. Both stay
   * available so the two can be compared (PRD ask), toggled in Settings. */
  aiGradientBlue: [string, string];
  navyGradient: [string, string];
}

// Growth green as the primary brand color. Navy carries premium/trust
// weight for headline numbers, purple is reserved for Lulu's own AI voice,
// market blue for investment data, gold for achievements. Amber/orange is
// the "coaching" tone (worth your attention, framed as opportunity) — red
// is reserved for genuinely urgent items only (a payment due tomorrow),
// never for "you're behind" framing.
export const lightColors: ColorTokens = {
  background: '#F4F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF4F0',
  border: '#E1E9E4',
  borderStrong: '#CCDACF',
  textPrimary: '#0F1613',
  textSecondary: '#5C6B60',
  textMuted: '#8E9C92',
  accent: '#17945A',
  accentStrong: '#0F6B41',
  accentSoft: '#E1F5EA',
  secondary: '#3E7BC4',
  secondarySoft: '#E8F1FC',
  success: '#17945A',
  successSoft: '#E1F5EA',
  successBright: '#22C55E',
  warning: '#B5750B',
  warningSoft: '#FCF0DD',
  danger: '#C23B3B',
  dangerSoft: '#FBEAEA',
  onAccent: '#FFFFFF',
  navy: '#122444',
  navySoft: '#E7EBF3',
  onNavy: '#FFFFFF',
  purple: '#6D4FC2',
  purpleSoft: '#EFEAFA',
  onPurple: '#FFFFFF',
  aiBlue: '#0E86A8',
  aiBlueSoft: '#E3F4F8',
  onAiBlue: '#FFFFFF',
  market: '#2563A8',
  marketSoft: '#E5EFF9',
  gold: '#B4881A',
  goldSoft: '#FBF1DA',
  onGold: '#FFFFFF',
  heroGradient: ['#0F6B41', '#17945A'],
  aiGradient: ['#4F3B96', '#6D4FC2'],
  aiGradientBlue: ['#0B2A4A', '#12A9C4'],
  navyGradient: ['#0A1830', '#1C3A66'],
};

export const darkColors: ColorTokens = {
  background: '#0B120F',
  surface: '#141E19',
  surfaceMuted: '#1C2822',
  border: '#28362F',
  borderStrong: '#38493F',
  textPrimary: '#EDF2EF',
  textSecondary: '#A9B5AE',
  textMuted: '#76867C',
  accent: '#33C77D',
  accentStrong: '#25A868',
  accentSoft: '#16362A',
  secondary: '#6FA8E0',
  secondarySoft: '#152A3D',
  success: '#33C77D',
  successSoft: '#16362A',
  successBright: '#4ADE80',
  warning: '#E3A23B',
  warningSoft: '#3A2C12',
  danger: '#E2605F',
  dangerSoft: '#3A1616',
  onAccent: '#06120C',
  navy: '#1A2F52',
  navySoft: '#18223A',
  onNavy: '#EDF2EF',
  purple: '#9077DE',
  purpleSoft: '#241C3E',
  onPurple: '#0B120F',
  aiBlue: '#22B8DE',
  aiBlueSoft: '#123443',
  onAiBlue: '#06120C',
  market: '#5B9BDA',
  marketSoft: '#132535',
  gold: '#E0B84A',
  goldSoft: '#332812',
  onGold: '#0B120F',
  heroGradient: ['#0F3D28', '#1D7A4C'],
  aiGradient: ['#2E2352', '#5B3FA0'],
  aiGradientBlue: ['#0E3B5C', '#1FB8D6'],
  navyGradient: ['#0D1A2E', '#22456F'],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  card: 20,
  control: 12,
  pill: 999,
};

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const },
};

export const minTouchTarget = 44;
