/**
 * Ask Nolie — typed capability/feature-flag integration point (floating
 * navigation design pass). No AI backend, conversation, or advice logic
 * exists anywhere behind this flag; it exists solely so the quick-actions
 * tray's centre tile can be swapped from "Add anything" to a real Ask
 * Nolie entry point later, in one place, without touching the tray's own
 * rendering logic.
 *
 * A real Ask Nolie experience (chat UI, backend, conversation state) is
 * explicitly out of scope for this pass and will need its own separate
 * product, privacy, compliance, and AI-behaviour specification before
 * `enabled` ever flips to true. `src/components/navigation/AskLuluSheet.tsx`
 * (an existing "Coming with Premium" teaser, not a working assistant) is
 * intentionally left unwired here — it stays in the repo as a possible
 * starting point for that future work, not as today's fallback.
 */
export interface AskNolieCapability {
  enabled: boolean;
  /** Invoked instead of the default "Add anything" tray action once a real
   * Ask Nolie destination exists. Left undefined while `enabled` is false. */
  open?: () => void;
}

export const askNolieCapability: AskNolieCapability = {
  enabled: false,
};

export interface CenterTileConfig {
  kind: 'askNolie' | 'addAnything';
  label: string;
}

/** Pure resolver for the tray's centre-tile copy/kind, so the branching
 * between "Ask Nolie" and its "Add anything" fallback is a single testable
 * function rather than embedded directly in the tray's render logic. */
export function resolveCenterTileConfig(capability: AskNolieCapability, assistantName: string): CenterTileConfig {
  return capability.enabled ? { kind: 'askNolie', label: `Ask ${assistantName}` } : { kind: 'addAnything', label: 'Add anything' };
}
