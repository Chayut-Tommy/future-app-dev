import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendPresentation } from '../../lib/calculations/safeToSpendPresentation';
import { TodayBriefingEventRow, formatBriefingDateContext } from '../../lib/calculations/todayBriefing';
import { SmartReminder } from '../../lib/calculations/reminders';
import { ScoreChipPresentation } from '../../lib/calculations/scoreChipPresentation';
import { ScoreChip } from './ScoreChip';
import { BriefingTile, selectBriefingTiles } from '../../lib/calculations/briefingTiles';
import { BriefingTileRow } from './BriefingTileRow';

/**
 * "Your Today Briefing" — canonical composition (Pass 2B, layout
 * correction):
 *   1. title + date/context header
 *   2. the compact Navilo Score chip — separate from, and never counted
 *      toward, the three-item financial budget below; visually subordinate
 *      to the primary money status beneath it.
 *   3. up to three compact summary tiles (BriefingTileRow) — AUP always
 *      first, the top Smart Reminder next when eligible, then independent
 *      upcoming-event tiles. Total tile count is bounded by the exact same
 *      upstream budget the previous row-based layout used
 *      (selectTodayBriefingEventRows sizes eventRows down to 1 whenever a
 *      reminder is present) — selectBriefingTiles (briefingTiles.ts) adds
 *      no capping of its own, so this correction cannot change Briefing
 *      eligibility, priority, or the three-item cap. The Score chip sits
 *      outside this tile row entirely, so it can never occupy one of the
 *      three slots.
 *
 * Layout correction — the previous large white inner card (a SectionCard
 * holding stacked AUP/reminder/event rows, with the reminder's full
 * detailed question and account-choice controls embedded directly inside
 * it) is gone. The reminder's full detail — including every account-choice
 * control — now lives exclusively in ReminderDetailSheet, reached by
 * tapping the compact Reminder tile; this is both the fix for the
 * confirmed overflow (an unbounded row of account-choice pills has no
 * reason to exist inside a one-third-width tile) and the "ambient hero →
 * Score summary → up to three lightweight tiles" simplified construction
 * this correction asks for. Every tile's destination — AUP, the reminder
 * sheet, or an event's Money-timeline focus — is exactly the same
 * authoritative destination the old rows already used; only the visual
 * presentation changed.
 *
 * Colour correction — the hero gradient, tile surface/border, and tile
 * accent colours all now read from `naviloPalette` (ThemeContext), which
 * resolves the user's selected Navilo colour style (Ocean Blue / Purple /
 * Sunrise) — never a hard-coded gradient. See theme/palettes.ts.
 */
export function TodayBriefingCard({
  today,
  scoreChip,
  presentation,
  eventRows,
  topReminder,
  onPressScoreChip,
  onPressAup,
  onPressEventRow,
  onPressReminderTile,
  headingRef,
  reminderTileRef,
}: {
  /** The same local-calendar Date every other Briefing calculation already
   * derives from (TodayScreen's useCurrentLocalDate-sourced `currentDate`)
   * — never a separately-captured `new Date()`, so the header always agrees
   * with what the rest of the Briefing is actually showing. */
  today: Date;
  scoreChip: ScoreChipPresentation;
  presentation: SafeToSpendPresentation;
  eventRows: TodayBriefingEventRow[];
  topReminder: SmartReminder | null;
  onPressScoreChip: () => void;
  onPressAup: () => void;
  onPressEventRow: (row: TodayBriefingEventRow) => void;
  /** Opens ReminderDetailSheet — the compact Reminder tile's tap-through
   * destination. This component never renders reminder confirmation/
   * account-choice UI itself. */
  onPressReminderTile: () => void;
  /** Reminder focus/announcements task — forwarded to this card's own
   * "Your Today Briefing" heading. TodayScreen uses this as the safe
   * fallback focus target when the Reminder sheet fully closes and the
   * originating Reminder tile no longer exists (every reminder resolved). */
  headingRef?: RefObject<any>;
  /** Reminder focus/announcements task — forwarded to BriefingTileRow,
   * attached only to the 'reminder' tile when one is present. TodayScreen
   * uses this to restore accessibility focus there when the Reminder sheet
   * closes and that exact tile still exists. */
  reminderTileRef?: RefObject<any>;
}) {
  const { spacing, radius, typography, glow, naviloPalette } = useTheme();

  const tiles = useMemo(() => selectBriefingTiles(presentation, topReminder, eventRows), [presentation, topReminder, eventRows]);

  function handlePressTile(tile: BriefingTile) {
    if (tile.kind === 'aup') {
      onPressAup();
      return;
    }
    if (tile.kind === 'reminder') {
      onPressReminderTile();
      return;
    }
    const row = eventRows.find((r) => `event-${r.key}` === tile.key);
    if (row) onPressEventRow(row);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg, ...glow(naviloPalette.heroGradientStart) },
        sectionHeader: { marginBottom: spacing.md },
        sectionTitle: { ...typography.title, fontSize: 19, fontWeight: '800', color: naviloPalette.heroForeground },
        sectionDateContext: { ...typography.caption, fontSize: 13, color: naviloPalette.heroForeground, opacity: 0.82, marginTop: 2 },
      }),
    [radius, spacing, typography, glow, naviloPalette]
  );

  return (
    <LinearGradient colors={[naviloPalette.heroGradientStart, naviloPalette.heroGradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.sectionHeader}>
        <Text ref={headingRef} style={styles.sectionTitle} accessibilityRole="header">Your Today Briefing</Text>
        <Text style={styles.sectionDateContext}>{formatBriefingDateContext(today)}</Text>
      </View>
      <ScoreChip presentation={scoreChip} onPress={onPressScoreChip} />
      <BriefingTileRow tiles={tiles} onPressTile={handlePressTile} reminderTileRef={reminderTileRef} />
    </LinearGradient>
  );
}
