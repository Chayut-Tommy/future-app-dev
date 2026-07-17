import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { computeTopReminder, stepFrequency } from '../../lib/calculations/reminders';
import { AddCreditCardModal } from '../credit/AddCreditCardModal';

/**
 * Smart reminder — one focused "did this happen?" question at a time (PRD
 * ask: salary/bill confirmations). Never assumes money moved on its own:
 * every state change here only happens after the user explicitly confirms.
 * Session-scoped dismissal only (resets on next app open) — there's no
 * persisted "seen" list, so this intentionally stays lightweight rather
 * than growing a parallel notification-history feature.
 */
export function SmartReminderCard() {
  const { data, addTransaction, updateRecurringItem } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography } = useTheme();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [awaitingSource, setAwaitingSource] = useState(false);
  const [markPaidCardVisible, setMarkPaidCardVisible] = useState(false);

  const reminder = useMemo(() => {
    const top = computeTopReminder(data);
    return top && !dismissedIds.has(top.id) ? top : null;
  }, [data, dismissedIds]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
        iconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        body: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
        actionRow: { flexDirection: 'row', gap: spacing.sm },
        actionButton: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.accent },
        actionButtonSecondary: { backgroundColor: colors.surfaceMuted },
        actionText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
        actionTextSecondary: { color: colors.textSecondary },
      }),
    [colors, radius, spacing, typography]
  );

  if (!reminder) return null;

  function dismiss() {
    if (!reminder) return;
    setDismissedIds((prev) => new Set(prev).add(reminder.id));
    setAwaitingSource(false);
  }

  function confirmSalary() {
    if (!reminder || !reminder.recurringItemId || reminder.amount === undefined) return;
    const item = data.recurringItems.find((r) => r.id === reminder.recurringItemId);
    if (!item) return;
    // Best-effort match back to a real income category by name (the
    // add-income flow prefills the source's label from a category, e.g.
    // "Salary", "Rental income") — falls back to a generic bucket rather
    // than guessing, never fabricating a category that wasn't real.
    const matchedCategory = data.categories.find((c) => c.type === 'income' && c.name.toLowerCase() === item.label.toLowerCase());
    addTransaction({
      type: 'income',
      amount: reminder.amount,
      categoryId: matchedCategory?.id ?? 'cat-other-income',
      date: new Date().toISOString(),
      recurringItemId: item.id,
    });
    updateRecurringItem(item.id, { nextDueDate: stepFrequency(item.nextDueDate, item.frequency) });
    dismiss();
  }

  function confirmBillPaid(source: 'cash' | 'credit_card') {
    if (!reminder || !reminder.recurringItemId || reminder.amount === undefined) return;
    const item = data.recurringItems.find((r) => r.id === reminder.recurringItemId);
    if (!item) return;
    addTransaction({
      type: 'expense',
      amount: reminder.amount,
      categoryId: 'cat-other-expense',
      date: new Date().toISOString(),
      paymentSource: source,
      creditCardId: source === 'credit_card' ? data.creditCards[0]?.id : undefined,
      recurringItemId: item.id,
    });
    updateRecurringItem(item.id, { nextDueDate: stepFrequency(item.nextDueDate, item.frequency) });
    dismiss();
  }

  const icon = reminder.kind === 'salary_check' ? 'cash-outline' : reminder.kind === 'card_due_soon' ? 'card-outline' : 'calendar-outline';
  const reminderCard = reminder.creditCardId ? data.creditCards.find((c) => c.id === reminder.creditCardId) ?? null : null;

  return (
    <SectionCard>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={16} color={colors.accentStrong} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{reminder.title}</Text>
          <Text style={styles.body}>{reminder.body}</Text>

          {reminder.kind === 'salary_check' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={confirmSalary}>
                <Text style={styles.actionText}>Yes, it arrived</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss}>
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {reminder.kind === 'bill_overdue' && !awaitingSource ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => setAwaitingSource(true)}>
                <Text style={styles.actionText}>Yes, I paid it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss}>
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {reminder.kind === 'bill_overdue' && awaitingSource ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => confirmBillPaid('cash')}>
                <Text style={styles.actionText}>From cash</Text>
              </TouchableOpacity>
              {data.creditCards.length > 0 ? (
                <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => confirmBillPaid('credit_card')}>
                  <Text style={[styles.actionText, styles.actionTextSecondary]}>From credit card</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {reminder.kind === 'bill_due_soon' ? (
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={dismiss}>
              <Text style={[styles.actionText, styles.actionTextSecondary]}>Got it</Text>
            </TouchableOpacity>
          ) : null}

          {reminder.kind === 'card_due_soon' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Cards')}>
                <Text style={styles.actionText}>Review card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => (reminderCard ? setMarkPaidCardVisible(true) : dismiss())}
              >
                <Text style={[styles.actionText, styles.actionTextSecondary]}>Mark as paid</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
      {/* Never assumes the balance is cleared automatically — opens the
          card's own edit form so the user confirms the real new balance
          (PRD ask: never assume money moved without confirming first). */}
      <AddCreditCardModal
        visible={markPaidCardVisible}
        editCard={reminderCard}
        onClose={() => {
          setMarkPaidCardVisible(false);
          dismiss();
        }}
      />
    </SectionCard>
  );
}
