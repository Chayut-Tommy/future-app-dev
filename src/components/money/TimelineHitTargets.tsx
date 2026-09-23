import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { BALANCE_PATH_MIN_TARGET, BalancePathHitTarget, RailHitGroup, plotX } from '../../lib/calculations/balancePathInteraction';

const HALO = 22;

/**
 * Pass D.3 — the press layer every marker rail shares: a halo behind each selected
 * marker, a tap-elsewhere backdrop that clears the selection, and ONE real,
 * accessible ≥44pt press target per slot (chronological, never overlapping). The
 * decorative track is rendered by the owner underneath; this layer performs no
 * date or money logic and reads only the already-resolved targets.
 */
export function TimelineHitTargets<G extends RailHitGroup>({
  targets,
  selected,
  selectedKey,
  labels,
  width,
  targetRefs,
  onToggle,
  onClear,
  testID,
}: {
  targets: BalancePathHitTarget<G>[];
  selected: BalancePathHitTarget<G> | null;
  selectedKey: string | null;
  labels: Map<string, string>;
  width: number;
  targetRefs: React.MutableRefObject<Map<string, View | null>>;
  onToggle: (t: BalancePathHitTarget<G>) => void;
  onClear: () => void;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        haloLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
        halo: { position: 'absolute', top: (BALANCE_PATH_MIN_TARGET - HALO) / 2, width: HALO, height: HALO, borderRadius: HALO / 2, borderWidth: 1.5, borderColor: semantic.interactive, backgroundColor: semantic.interactiveTint },
        backdrop: { ...StyleSheet.absoluteFillObject },
        target: { position: 'absolute', top: 0, height: BALANCE_PATH_MIN_TARGET },
      }),
    [semantic]
  );

  return (
    <>
      {/* Decorative halo(s) for the open selection — hidden from AT. */}
      {selected && width > 0 ? (
        <View style={styles.haloLayer} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {selected.groups.map((g) => (
            <View key={`halo-${g.key}`} style={[styles.halo, { left: Math.min(Math.max(0, plotX(g.x, width) - HALO / 2), Math.max(0, width - HALO)) }]} testID={`timeline-halo-${g.key}`} />
          ))}
        </View>
      ) : null}

      {/* A tap elsewhere on the rail clears the selection. Close is the accessible dismissal. */}
      {selected ? <Pressable style={styles.backdrop} onPress={onClear} accessible={false} importantForAccessibility="no" testID={testID ? `${testID}-backdrop` : undefined} /> : null}

      {/* Real, accessible press targets — one per slot, chronological, never overlapping. */}
      {targets.map((t) => {
        const isSelected = t.key === selectedKey;
        return (
          <Pressable
            key={t.key}
            ref={(node) => {
              targetRefs.current.set(t.key, node as unknown as View | null);
            }}
            style={[styles.target, { left: t.left, width: t.width }]}
            onPress={() => onToggle(t)}
            accessibilityRole="button"
            accessibilityLabel={labels.get(t.key)}
            accessibilityHint={isSelected ? 'Hides the details for these scheduled events' : 'Shows the details for these scheduled events'}
            accessibilityState={{ selected: isSelected }}
            testID={`timeline-target-${t.key}`}
          />
        );
      })}
    </>
  );
}
