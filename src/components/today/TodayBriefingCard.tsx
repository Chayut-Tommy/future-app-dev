import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { RefObject } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { SafeToSpendPresentation } from '../../lib/calculations/safeToSpendPresentation';
import { TodayBriefingEventRow } from '../../lib/calculations/todayBriefing';
import { SmartReminder } from '../../lib/calculations/reminders';
import { selectBriefingTiles } from '../../lib/calculations/briefingTiles';
import { BriefingPriorityRow as PriorityRowModel, selectBriefingPriorityRows } from '../../lib/calculations/briefingPriorityRows';
import { TimelineEvent } from '../../lib/calculations/moneyTimeline';
import { BriefingPriorityRow } from './BriefingPriorityRow';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { textStyle, typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import { isAccessibilityText, resolveHeroEmphasis } from '../../lib/calculations/todayComposition';
import i18n from '../../i18n';

/**
 * "Your Today Briefing" — Design 5.1 p.7, the single expressive hero on
 * Today.
 *
 * WHAT CHANGED IN WAVE 5's VISUAL PASS, AND WHY
 *
 * The previous construction was a saturated purple gradient block holding
 * a three-column tile grid. It had two problems the owner's device review
 * confirmed. First, the AUP figure — the one number the whole screen
 * exists to deliver — was rendered at tile scale, the same size as the
 * words "Bill due" beside it, so nothing on the page was visually
 * dominant. Second, a third of a phone's width cannot hold a customer's
 * own bill name, an exact date and an amount, so each tile could only
 * carry a category word; the customer had to tap to learn anything.
 *
 * The anatomy is now:
 * The date/context line the old header carried is gone from here: Design
 * 5.1 p.7 states the local date ONCE, as the page's own eyebrow above the
 * greeting (TodayScreen's `today-date-eyebrow`, derived from the same live
 * useCurrentLocalDate value). Repeating it inside the hero was exactly the
 * duplicated heading the density rules bar.
 *
 *   2. measure label — the presentation's own heading
 *   3. the canonical financial figure, at figureHero
 *   4. the timeframe line — days to payday and the daily division
 *   5. divider
 *   6. zero to two full-width priority rows
 *   7. provenance footer, left
 *   8. How this works, right
 *
 * Every value still comes from the same engines, selected by the same
 * selectors, in the same order, under the same budget. selectBriefingTiles
 * still decides composition; selectBriefingPriorityRows only enriches what
 * it produced with the date and amount a tile had no room for. This
 * component cannot change eligibility, priority, or the cap.
 *
 * The surface is `heroSurface` — the one Premium Expressive surface the
 * style is permitted to retint — not the old saturated gradient. Text
 * therefore reads from the ordinary shared ink roles, which is what makes
 * the figure legible in all six themes without a per-theme override.
 */
/** Design 5.1 — the Briefing's identity tile. Matches the 36pt tile size
 * the shared Add icon system already uses, so Today's tiles share one
 * rhythm rather than each picking a size. */
const BRIEFING_IDENTITY_TILE_SIZE = 36;
const BRIEFING_IDENTITY_GLYPH_SIZE = 20;

export function TodayBriefingCard({
  presentation,
  eventRows,
  timelineEvents,
  topReminder,
  timeframeLine,
  onPressAup,
  onPressEventRow,
  onPressReminderTile,
  onPressHowThisWorks,
  headingRef,
  reminderTileRef,
}: {
  presentation: SafeToSpendPresentation;
  eventRows: TodayBriefingEventRow[];
  /** The same timeline the Briefing's own event rows were selected from —
   * passed so a row can show the exact date and amount its own selection
   * already knew about. Never re-filtered or re-sorted here. */
  timelineEvents: TimelineEvent[];
  topReminder: SmartReminder | null;
  /** Already formatted by formatHeroTimeframe from the Safe-to-Spend
   * result; null when no payday is genuinely known. */
  timeframeLine: string | null;
  onPressAup: () => void;
  onPressEventRow: (row: TodayBriefingEventRow) => void;
  onPressReminderTile: () => void;
  /** Opens the existing Available Until Payday explanation — the same
   * destination the hero figure itself opens. */
  onPressHowThisWorks: () => void;
  headingRef?: RefObject<any>;
  reminderTileRef?: RefObject<any>;
}) {
  const { semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const compact = width <= designLayout.breakpoints.compactMax;
  const stackFooter = isAccessibilityText(fontScale);

  const tiles = useMemo(() => selectBriefingTiles(presentation, topReminder, eventRows), [presentation, topReminder, eventRows]);
  const priorityRows = useMemo(
    () => selectBriefingPriorityRows(tiles, eventRows, timelineEvents, topReminder),
    [tiles, eventRows, timelineEvents, topReminder]
  );

  const figureType = textStyle('figureHero', locale);
  const titleType = textStyle('titleSection', locale);

  // Wave 5 closure — restrained semantic colour. The hero carries ONE
  // Ocean Blue anchor (the figure, plus the eyebrow and its two links) and,
  // where it genuinely applies, ONE status colour. Everything else — the
  // measure label, the timeframe line, the explanatory sentences, dates and
  // provenance — stays neutral ink, so the colour that is present means
  // something rather than decorating every line.
  //
  // A shortfall is never signalled by colour alone: the warning ink is
  // paired with an alert glyph and with the presentation's own wording,
  // which states the shortfall in full.
  const emphasis = resolveHeroEmphasis(presentation.heroState, presentation.amountVisible && !!presentation.displayAmount);

  function handlePressRow(row: PriorityRowModel) {
    if (row.kind === 'reminder') {
      onPressReminderTile();
      return;
    }
    const key = row.key.replace(/^event-/, '');
    const eventRow = eventRows.find((r) => r.key === key);
    if (eventRow) onPressEventRow(eventRow);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          borderRadius: designRadius.hero,
          padding: compact ? designLayout.cardPadding : designLayout.heroPadding,
          marginBottom: designLayout.sectionGap,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
        },
        // Wave 5 polish — the Briefing's identity row. This was a 12.5pt
        // all-caps label with nothing beside it, which read as a caption
        // rather than as the name of the page's primary surface. It is now
        // a 36pt semantic tint tile and a title-case title, so the hero is
        // recognisable at a glance without becoming heavier: the row costs
        // one spacing token of height over the label it replaces, and the
        // measure label beneath it gives back a step to compensate.
        identityRow: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.md },
        identityTile: {
          width: BRIEFING_IDENTITY_TILE_SIZE,
          height: BRIEFING_IDENTITY_TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.interactiveTint,
        },
        // Title case, not all caps — and the Ocean Blue interactive ink
        // that distinguishes the hero's own title from Today's neutral
        // section headings. Clears 4.5:1 on every heroSurface stop in all
        // six themes (design5-wave5-today-hierarchy §18v).
        identityTitle: { ...typeStyle('titleSection', locale), color: semantic.interactive, flexShrink: 1 },
        measureLabel: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        figure: { ...figureType.style, color: semantic.interactive, marginTop: designSpacing.xs },
        // The setup/unavailable states keep the hero's geometry but must
        // never render an empty figure slot or a fabricated $0 — they show
        // the presentation's own exact guidance sentence instead.
        // Warning ink ONLY for a genuine shortfall. A missing input is a
        // gap, not a money problem, and stays neutral.
        guidance: {
          ...typeStyle('titleSection', locale),
          color: emphasis === 'shortfall' ? semantic.warning : semantic.textPrimary,
          marginTop: designSpacing.xs,
          flexShrink: 1,
        },
        guidanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: designSpacing.sm },
        guidanceIcon: { marginTop: 4 },
        guidanceSupport: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        timeframe: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        setupAction: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.xs,
          minHeight: designLayout.touchTargetMin,
          marginTop: designSpacing.sm,
        },
        setupActionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: semantic.border,
          marginTop: designSpacing.lg,
        },
        rows: { marginTop: designSpacing.xs },
        footer: {
          flexDirection: stackFooter ? 'column' : 'row',
          alignItems: stackFooter ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          gap: designSpacing.sm,
          marginTop: designSpacing.lg,
          paddingTop: designSpacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.border,
        },
        provenance: { ...typeStyle('meta', locale), color: semantic.textTertiary, flexShrink: 1 },
        howRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.xs,
          minHeight: designLayout.touchTargetMin,
        },
        howText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
      }),
    [semantic, locale, compact, stackFooter, figureType.style, emphasis]
  );

  const amountVisible = presentation.amountVisible && !!presentation.displayAmount;

  return (
    <LinearGradient
      colors={semantic.heroSurface as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
      testID="today-briefing-hero"
    >
      {/* The tile is decorative — the title supplies the accessible name,
          so there is exactly ONE announcement here, not two. */}
      <View style={styles.identityRow}>
        <View
          style={styles.identityTile}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="today-briefing-identity-tile"
        >
          <Ionicons name="sunny-outline" size={BRIEFING_IDENTITY_GLYPH_SIZE} color={semantic.interactive} />
        </View>
        <Text
          ref={headingRef}
          style={styles.identityTitle}
          accessibilityRole="header"
          maxFontSizeMultiplier={titleType.maxFontSizeMultiplier}
        >
          Your Today Briefing
        </Text>
      </View>

      {amountVisible ? (
        // The measure block is one tap target opening the SAME authoritative
        // AUP destination the old tile opened — the figure is the primary
        // affordance, not decoration. "How this works" in the footer reaches
        // the same explanation, which is the anatomy p.7 specifies; there is
        // no third AUP explanation anywhere on Today.
        <TouchableOpacity
          onPress={onPressAup}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${presentation.heading}, ${presentation.displayAmount}${timeframeLine ? `. ${timeframeLine}` : ''}`}
          accessibilityHint="Opens details"
          testID="today-briefing-measure"
        >
          <Text style={styles.measureLabel} importantForAccessibility="no">{presentation.heading}</Text>
          <Text
            style={styles.figure}
            importantForAccessibility="no"
            maxFontSizeMultiplier={figureType.maxFontSizeMultiplier}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.7}
            testID="today-briefing-figure"
          >
            {presentation.displayAmount}
          </Text>
          {timeframeLine ? <Text style={styles.timeframe} importantForAccessibility="no">{timeframeLine}</Text> : null}
        </TouchableOpacity>
      ) : (
        // Setup / unavailable: same hero geometry, no figure slot at all,
        // and the presentation's own exact missing-input sentence. Never
        // "$0" — invariant 10.
        <View testID="today-briefing-setup">
          <Text style={styles.measureLabel}>{presentation.heading}</Text>
          <View style={styles.guidanceRow}>
            {/* A second, non-colour signal for the shortfall — so the state
                never depends on the ink alone. The presentation's own
                wording states the shortfall in full alongside it. */}
            {emphasis === 'shortfall' ? (
              <Ionicons name="alert-circle-outline" size={19} color={semantic.warning} importantForAccessibility="no" style={styles.guidanceIcon} />
            ) : null}
            <Text style={styles.guidance} maxFontSizeMultiplier={titleType.maxFontSizeMultiplier}>
              {presentation.primaryCopy}
            </Text>
          </View>
          {presentation.supportingCopy ? <Text style={styles.guidanceSupport}>{presentation.supportingCopy}</Text> : null}
          <TouchableOpacity
            style={styles.setupAction}
            onPress={onPressAup}
            accessibilityRole="button"
            // Named with the same AVAILABLE… heading the measure block
            // uses, so the AUP affordance carries one consistent accessible
            // name in every state rather than changing identity when the
            // amount cannot be shown.
            accessibilityLabel={`${presentation.heading}, ${presentation.compactSummary}`}
            testID="today-briefing-setup-action"
          >
            <Text style={styles.setupActionText}>What's missing</Text>
            <Ionicons name="chevron-forward" size={16} color={semantic.interactive} />
          </TouchableOpacity>
        </View>
      )}

      {priorityRows.length > 0 ? (
        <>
          <View style={styles.divider} />
          <View style={styles.rows} testID="today-briefing-priority-rows">
            {priorityRows.map((row, index) => (
              <BriefingPriorityRow
                key={row.key}
                row={row}
                onPress={() => handlePressRow(row)}
                focusRef={row.kind === 'reminder' ? reminderTileRef : undefined}
                isLast={index === priorityRows.length - 1}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.provenance} testID="today-briefing-provenance">
          Based on what you’ve recorded · updated today
        </Text>
        <TouchableOpacity
          style={styles.howRow}
          onPress={onPressHowThisWorks}
          accessibilityRole="button"
          accessibilityLabel="How this works"
          accessibilityHint="Opens how your available amount is worked out"
          testID="today-briefing-how-this-works"
        >
          <Text style={styles.howText}>How this works</Text>
          <Ionicons name="information-circle-outline" size={16} color={semantic.interactive} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}
