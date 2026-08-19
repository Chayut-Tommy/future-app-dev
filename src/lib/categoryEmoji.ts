/**
 * Nolie Design 5.1 Wave 4 — categories resolve to a designed Ionicons glyph
 * and its domain tone, never a platform emoji.
 *
 * The file keeps its name and its one-function shape so no call site had to
 * be rewired, but every mapping lives in the single central map in
 * `lib/addIcons.ts` alongside the other seven Add-experience maps.
 */
import { AddIconSpec, categoryIcon } from './addIcons';

/** The full icon spec — glyph AND tone — for a category. */
export function categoryIconSpec(categoryId: string): AddIconSpec {
  return categoryIcon(categoryId);
}

/** @deprecated Use `categoryIconSpec`. Retained so pre-Wave-4 call sites
 * outside the Add journey keep compiling untouched; it returns the icon
 * NAME only, and never an emoji. */
export function categoryEmoji(categoryId: string): string {
  return categoryIcon(categoryId).name;
}
