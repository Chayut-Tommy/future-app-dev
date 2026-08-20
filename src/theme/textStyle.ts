import type { TextStyle } from 'react-native';
import { resolveTextStyle, TypeRoleName, AppLocale, ResolveTextStyleOptions } from './typography';

/**
 * Design 5.1 — the React Native adapter for the type scale.
 *
 * `typography.ts` stays RN-free so the legacy harness can import it, which
 * means `resolveTextStyle` returns a plain object shaped LIKE a TextStyle
 * but carrying one field React Native does not understand: `maxScale`,
 * the role's Dynamic Type cap. Passing that object straight into
 * StyleSheet.create is a type error, and stripping it by hand at every
 * call site (as Screen.tsx does today) both repeats itself and quietly
 * drops the cap.
 *
 * This splits the two concerns properly: `style` is a real TextStyle, and
 * `maxFontSizeMultiplier` is the prop React Native actually applies the
 * cap through. Body-class roles have no cap and correctly come back
 * undefined, which is React Native's own "scale freely" value — so
 * uncapped roles reflow rather than being pinned.
 */
export interface AdaptedTextStyle {
  style: TextStyle;
  maxFontSizeMultiplier: number | undefined;
}

export function textStyle(
  role: TypeRoleName,
  locale: AppLocale,
  options: ResolveTextStyleOptions = {}
): AdaptedTextStyle {
  const { maxScale, fontVariant, ...rest } = resolveTextStyle(role, locale, options);
  const style: TextStyle = { ...rest };
  if (fontVariant) style.fontVariant = [...fontVariant];
  return { style, maxFontSizeMultiplier: maxScale };
}

/** The style alone, for the common case where the cap is applied on the
 * component via `maxFontSizeMultiplier` separately (or where the role is
 * uncapped anyway). */
export function typeStyle(role: TypeRoleName, locale: AppLocale, options: ResolveTextStyleOptions = {}): TextStyle {
  return textStyle(role, locale, options).style;
}
