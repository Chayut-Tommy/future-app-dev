import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import type { BalancePathHitTarget, BalancePathInspection, RailHitGroup } from '../lib/calculations/balancePathInteraction';
import { sendFocusEvent } from '../lib/a11yFocus';

/**
 * Pass D.3 — ONE selection owner for every marker rail (the selected-date timeline
 * and the pay-cycle bar). Component state only: which press target is open, its
 * description, and the focus-return contract (Close returns assistive focus to the
 * marker that opened the detail). Opening, replacing and closing write nothing.
 *
 * `identity` names the horizon the selection belongs to; when it changes (a new
 * target date, a new cycle) the selection is cleared.
 */
export function useTimelineSelection<G extends RailHitGroup>(
  targets: BalancePathHitTarget<G>[],
  describe: (target: BalancePathHitTarget<G>) => BalancePathInspection,
  identity: string
) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const targetRefs = useRef(new Map<string, View | null>());

  useEffect(() => {
    setSelectedKey(null);
  }, [identity]);

  const selected = useMemo(() => targets.find((t) => t.key === selectedKey) ?? null, [targets, selectedKey]);
  const inspection = useMemo(() => (selected ? describe(selected) : null), [selected, describe]);
  const labels = useMemo(() => new Map(targets.map((t) => [t.key, describe(t).targetLabel])), [targets, describe]);

  const close = useCallback(() => {
    const key = selectedKey;
    setSelectedKey(null);
    if (key) sendFocusEvent({ current: targetRefs.current.get(key) ?? null });
  }, [selectedKey]);
  const clear = useCallback(() => setSelectedKey(null), []);
  // One detail at a time: a second marker REPLACES the first; the same marker toggles.
  const toggle = useCallback(
    (t: BalancePathHitTarget<G>) => {
      setSelectedKey((cur) => {
        if (cur === t.key) return null;
        AccessibilityInfo.announceForAccessibility(describe(t).announcement);
        return t.key;
      });
    },
    [describe]
  );

  return { selectedKey, selected, inspection, labels, toggle, close, clear, targetRefs };
}
