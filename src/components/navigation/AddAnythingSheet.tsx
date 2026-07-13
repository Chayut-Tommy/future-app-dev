import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { brand } from '../../lib/brand';

export type AddAnythingKind =
  | 'income'
  | 'income_received'
  | 'expense'
  | 'bill'
  | 'transfer'
  | 'cash'
  | 'savings'
  | 'investment'
  | 'property'
  | 'retirement'
  | 'liability'
  | 'creditCard'
  | 'goal';

interface AddAnythingOption {
  key: AddAnythingKind;
  label: string;
  emoji: string;
}

interface AddAnythingGroup {
  title: string;
  options: AddAnythingOption[];
}

// Grouped by real-world intent (PRD ask, §2): Income and Expense are
// separate top-level actions rather than one hidden behind the other, and
// "income source" (salary — feeds Money Plan/payday math) is kept visibly
// distinct from "income received" (a one-off or ad-hoc amount — updates
// cash only, never silently becomes a recurring salary).
const GROUPS: AddAnythingGroup[] = [
  {
    title: 'Money',
    options: [
      { key: 'expense', label: 'Add expense', emoji: '🛒' },
      { key: 'income', label: 'Add income source', emoji: '💼' },
      { key: 'income_received', label: 'Record income received', emoji: '💰' },
      { key: 'bill', label: 'Add bill', emoji: '📅' },
      { key: 'transfer', label: 'Transfer money', emoji: '🔁' },
    ],
  },
  {
    title: 'Wealth',
    options: [
      { key: 'cash', label: 'Add cash', emoji: '💵' },
      { key: 'savings', label: 'Add savings', emoji: '🏦' },
      { key: 'investment', label: 'Add investment', emoji: '📈' },
      { key: 'property', label: 'Add property', emoji: '🏠' },
      { key: 'retirement', label: 'Add retirement savings', emoji: '🛡' },
    ],
  },
  {
    title: 'Debt and planning',
    options: [
      { key: 'liability', label: 'Add liability', emoji: '📄' },
      { key: 'creditCard', label: 'Add credit card', emoji: '💳' },
      { key: 'goal', label: 'Add goal', emoji: '🎯' },
    ],
  },
];

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

/**
 * "+" = add or update my money, "Lulu" = ask for guidance — a clear
 * separation (PRD ask). This sheet is the single entry point for every
 * kind of manual entry, reachable from anywhere via the global floating +
 * button, so Today no longer needs its own Quick Actions row.
 */
export function AddAnythingSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (kind: AddAnythingKind) => void }) {
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  }

  function choose(kind: AddAnythingKind) {
    onClose();
    onSelect(kind);
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          dismiss();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
        title: { ...typography.heading, fontSize: 17, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
        body: { ...typography.caption, fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: spacing.lg },
        scroll: { maxHeight: 480 },
        groupTitle: { ...typography.caption, fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm, marginTop: spacing.md },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        tile: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        iconBadge: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
          ...cardShadow,
        },
        emoji: { fontSize: 20 },
        tileLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, insets.bottom, cardShadow]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Add to {brand.name}</Text>
          <Text style={styles.body}>What would you like to update?</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {GROUPS.map((group) => (
              <View key={group.title}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <View style={styles.grid}>
                  {group.options.map((o) => (
                    <TouchableOpacity key={o.key} style={styles.tile} activeOpacity={0.8} onPress={() => choose(o.key)}>
                      <View style={styles.iconBadge}>
                        <Text style={styles.emoji}>{o.emoji}</Text>
                      </View>
                      <Text style={styles.tileLabel}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
