import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { CashFlowStatus } from '../../lib/calculations/lookAheadPresentation';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass D.2 — the two surfaces that sit under the timeline on the ONE Money card, in
 * BOTH of its modes (Available until payday and a selected date). One owner, so the
 * payday and selected-date cards cannot drift apart. Presentation only: every word
 * and amount arrives already decided by the pure selectors; nothing is computed here.
 */

const TILE = 32;

/**
 * The cash-path status: one calm, contained surface instead of a run-on paragraph.
 * It is INFORMATION, not a control — no button role, no chevron, no press target.
 * Tone is never carried by colour alone: each tone has its own glyph and words.
 */
export function CashPathStatus({ status }: { status: CashFlowStatus }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const healthy = status.tone === 'healthy';
  const ink = healthy ? semantic.success : semantic.warning;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        surface: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: designSpacing.sm,
          marginTop: designSpacing.md,
          padding: designSpacing.md,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          backgroundColor: healthy ? semantic.successTint : semantic.warningTint,
          borderColor: healthy ? semantic.successBorder : semantic.warningBorder,
        },
        icon: { marginTop: 1 },
        text: { flex: 1 },
        title: { ...typeStyle('support', locale), fontWeight: '600', color: ink },
        detail: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
      }),
    [semantic, locale, healthy, ink]
  );

  return (
    // A plain container: no role, no press handler. The title announces itself as the
    // cash-flow status (as it always has); the supporting line follows as its own stop.
    <View style={styles.surface} testID="money-scenario-cashflow-row">
      <Ionicons
        name={healthy ? 'checkmark-circle' : 'alert-circle'}
        size={20}
        color={ink}
        style={styles.icon}
        importantForAccessibility="no"
        accessibilityElementsHidden
        testID={healthy ? 'money-scenario-cashflow-icon-healthy' : 'money-scenario-cashflow-icon-caution'}
      />
      <View style={styles.text}>
        <Text style={styles.title} accessibilityLabel={`Cash-flow status: ${status.title}`} maxFontSizeMultiplier={2} testID="money-scenario-cashflow">
          {status.title}
        </Text>
        {status.detail ? (
          <Text style={styles.detail} maxFontSizeMultiplier={2} testID={status.detailIsDeficit ? 'money-scenario-deficit' : 'money-scenario-cashflow-detail'}>
            {status.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export interface CardAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  hint: string;
  onPress: () => void;
  testID: string;
  /** Pass D.5 — so the sheet this row opens can return assistive focus to it. */
  controlRef?: React.Ref<View>;
}

/**
 * The grouped actions: ONE surface, one row per destination, each row a single press
 * target (never nested controls). Titles and subtitles wrap; the row grows with them.
 */
export function CardActionGroup({ actions, testID }: { actions: CardAction[]; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        group: {
          marginTop: designSpacing.md,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          backgroundColor: semantic.bgSurface,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          minHeight: designLayout.touchTargetMin + designSpacing.md,
          paddingVertical: designSpacing.sm,
          paddingHorizontal: designSpacing.md,
        },
        divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
        tile: { width: TILE, height: TILE, borderRadius: designRadius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.interactiveTint },
        text: { flex: 1 },
        title: { ...typeStyle('support', locale), fontWeight: '600', color: semantic.textPrimary },
        subtitle: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 1 },
      }),
    [semantic, locale]
  );

  if (actions.length === 0) return null;
  return (
    <View style={styles.group} testID={testID}>
      {actions.map((a, i) => (
        <TouchableOpacity
          key={a.key}
          ref={a.controlRef}
          style={[styles.row, i > 0 ? styles.divider : null]}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${a.title}. ${a.subtitle}`}
          accessibilityHint={a.hint}
          testID={a.testID}
        >
          <View style={styles.tile} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Ionicons name={a.icon} size={18} color={semantic.interactive} />
          </View>
          <View style={styles.text} importantForAccessibility="no-hide-descendants">
            <Text style={styles.title} maxFontSizeMultiplier={2}>{a.title}</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={2}>{a.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} importantForAccessibility="no" />
        </TouchableOpacity>
      ))}
    </View>
  );
}
