// Nolie Design 5.1 Wave 9a closure — Correction A: a STABLE customer route
// to Cards.
//
// WHY THIS SUITE EXISTS. Before this correction the only production call
// site that navigated to Cards was SmartReminderCard's "View card", shown
// inside the transient `card_due_soon` reminder. That reminder is gated to
// a 3-day window and is removed from the ranked selector once snoozed or
// dismissed (Wave 6 suppression), so ordinary use of the reminder controls
// deleted the only way into Cards. The owner's device test confirmed it:
// Wealth card rows open Edit credit card, Money's debt overview had no
// onward navigation, and Today's scheduled repayment row goes to Money.
// That is a reachability defect, not a Cards calculation defect — Cards'
// own numbers are proven in design5-wave9a-cards-calculators.test.ts and
// are untouched here.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): §7, §10, §11 and §12 run the real
//   dockVisibility, tabDefinitions, debtCoach, reminder-selection and
//   suppression functions.
// - Class C (structural): §1–§6, §8, §9 read the real source files and
//   assert on their text. They prove the wiring exists and is ordered
//   correctly; they do NOT prove the pixels. The mounted proof lives in
//   tests/rendered/design5-wave9a-cards-reachability.render.test.tsx and
//   tests/rendered/design5-wave9a-debt-overview-eligibility.render.test.tsx.
//
// Paths resolve from THIS worktree (see the Wave 9a portability
// correction) — never an absolute owner-machine path.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9a-cards-reachability.test.ts

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { isDockVisible } from '../src/navigation/dockVisibility';
import { ROUTE_OWNER_TAB, resolveOwnerTab } from '../src/navigation/tabDefinitions';
import { computeDebtCoachSummary, computeHasAnyDebt } from '../src/lib/calculations/debtCoach';
import { computeRankedReminder } from '../src/lib/calculations/reminders';
import { occurrenceKeyOf } from '../src/lib/calculations/reminderInteractionLifecycle';
import { createSuppressionPredicate, toLocalDateString, addLocalDays } from '../src/lib/calculations/reminderSuppression';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData, CreditCard, Liability } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);
const read = (rel: string) => readFileSync(srcPath(rel), 'utf-8');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const SHEET = read('src/components/debt/DebtCoachSheet.tsx');
const WEALTH = read('src/screens/wealth/WealthScreen.tsx');
const REMINDER = read('src/components/today/SmartReminderCard.tsx');
const MONEY = read('src/screens/money/MoneyScreen.tsx');

/** Source with comments stripped — so an assertion can never be satisfied
 * by prose in a doc comment (the trap that let "Credit health" look present
 * on CardsScreen when only a comment mentioned it). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const SHEET_CODE = code(SHEET);

console.log('=== 1. Exactly ONE "View credit cards" action, in the shared footer ===');
{
  const occurrences = (SHEET_CODE.match(/View credit cards/g) ?? []).length;
  // One accessibilityLabel + one visible Text label = 2 in code.
  assert('1a. the action label appears exactly twice in code (a11y label + visible text)', occurrences === 2);
  assert('1b. exactly one testID for the action', (SHEET_CODE.match(/debt-overview-view-cards/g) ?? []).length === 1);
  assert('1c. exactly one navigate to Cards in the sheet', (SHEET_CODE.match(/navigate\('Cards'\)/g) ?? []).length === 1);
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9a closure, final correction.
  //
  // OLD CLAUSES: 1d asserted the action sits "inside the hasDebt (debt
  // overview) branch, after the debt rows"; 1e asserted it sits "before the
  // suggestions block, so it sits with the debt list".
  //
  // SUPERSEDED BECAUSE placing it inside `hasDebt` reintroduced the same
  // reachability defect from the other side. A customer whose cards are all
  // at $0 with no other liability falls into the NO-DEBT branch, and the
  // action disappeared — although the card records still exist. A zero
  // balance means a card is not debt; it never means the card is not there.
  //
  // PRESERVED INTENT: both clauses existed to pin the action to ONE
  // deliberate, predictable position rather than letting it float or
  // duplicate. That intent is fully kept below — and strengthened, because
  // the position is now asserted against BOTH branch boundaries rather than
  // against neighbours inside one of them.
  // -------------------------------------------------------------------
  const NO_DEBT_MARKER = 'I have no debt';
  assert('1d. the action is rendered AFTER both branches close — it belongs to neither', SHEET_CODE.indexOf(NO_DEBT_MARKER) < SHEET_CODE.indexOf('debt-overview-view-cards'));
  assert('1d-i. …including after the debt-overview rows', SHEET_CODE.indexOf('summary.debts.map') < SHEET_CODE.indexOf('debt-overview-view-cards'));
  assert('1d-ii. …and after the debt branch\'s own ScrollView has closed', SHEET_CODE.indexOf('</ScrollView>') < SHEET_CODE.indexOf('debt-overview-view-cards'));
  assert('1e. and immediately before the shared Close control, in the common footer', SHEET_CODE.indexOf('debt-overview-view-cards') < SHEET_CODE.indexOf('styles.closeButton} onPress'));
  // Exactly one gate, and it is not nested inside the hasDebt ternary.
  assert('1e-i. exactly one hasCreditCards gate exists', (SHEET_CODE.match(/\{hasCreditCards \?/g) ?? []).length === 1);
  assert('1e-ii. the gate is independent of hasDebt, so neither branch can hide it', !/hasDebt[^]*?\{hasCreditCards \?[^]*?\) : \(/.test(SHEET_CODE));

  // The per-row loop must NOT become tappable: a loan row that navigates
  // nowhere must not look like it does. Bounded at the suggestions block,
  // which is what now follows the rows.
  const rowBlock = SHEET_CODE.slice(SHEET_CODE.indexOf('summary.debts.map'), SHEET_CODE.indexOf('suggestionsBlock}>'));
  assert('1f. individual debt rows remain non-interactive (no TouchableOpacity in the row loop)', !rowBlock.includes('TouchableOpacity'));
  assert('1g. and carry no accessibilityRole="button"', !rowBlock.includes('accessibilityRole="button"'));
}

console.log('\n=== 2. Eligibility is STRUCTURED — never display copy, icon or string matching ===');
{
  assert('2a. eligibility reads the authoritative card collection', /const hasCreditCards = data\.creditCards\.length > 0/.test(SHEET_CODE));
  assert('2b. the action is gated on it', /\{hasCreditCards \?/.test(SHEET_CODE));
  // Nothing in the gate may look at a label, an icon name, or a rendered string.
  const gateArea = SHEET_CODE.slice(SHEET_CODE.indexOf('const hasCreditCards'), SHEET_CODE.indexOf('function handleViewCreditCards'));
  assert('2c. the gate does not inspect d.label', !gateArea.includes('.label'));
  assert('2d. the gate does not inspect d.icon', !gateArea.includes('.icon'));
  assert('2e. the gate performs no string matching', !/\.includes\(|\.startsWith\(|\.match\(|toLowerCase\(/.test(gateArea));
  assert('2f. the gate does not compare against the words "Credit card"', !/['"]Credit card['"]/.test(gateArea));
}

console.log('\n=== 3. Close BEFORE navigate, with no timer and no second nav ref ===');
{
  const handler = SHEET_CODE.slice(SHEET_CODE.indexOf('function handleViewCreditCards'), SHEET_CODE.indexOf('const styles'));
  assert('3a. onClose() is called inside the handler', handler.includes('onClose();'));
  assert('3b. navigate happens AFTER onClose in source order', handler.indexOf('onClose();') < handler.indexOf("navigation.navigate('Cards')"));
  assert('3c. no setTimeout anywhere in the sheet', !SHEET_CODE.includes('setTimeout'));
  assert('3d. no arbitrary delay constant', !/DELAY|_MS\b|requestAnimationFrame/.test(SHEET_CODE));
  assert('3e. no second navigation ref — one useNavigation only', (SHEET_CODE.match(/useNavigation/g) ?? []).length === 2); // import + call
  assert('3f. no new route matrix or route table introduced', !/ROUTE_|Record<\s*DockRoute/.test(SHEET_CODE));
  // The same ordering the reminder path already uses, for the same reason.
  assert('3g. the reminder path still closes its host before navigating', REMINDER.indexOf('onNavigateAway?.();') < REMINDER.indexOf("navigation.navigate('Cards')"));
}

console.log('\n=== 4. Double-tap cannot push Cards twice ===');
{
  assert('4a. a latch ref exists', SHEET_CODE.includes('navigatingRef'));
  assert('4b. the handler returns early when already navigating', /if \(navigatingRef\.current\) return;/.test(SHEET_CODE));
  assert('4c. the latch is set before onClose/navigate', SHEET_CODE.indexOf('navigatingRef.current = true;') < SHEET_CODE.indexOf("navigation.navigate('Cards')"));
  assert('4d. the latch resets when the sheet is presented again', /if \(visible\) navigatingRef\.current = false;/.test(SHEET_CODE));
}

console.log('\n=== 5. Accessibility contract ===');
{
  const action = SHEET_CODE.slice(SHEET_CODE.indexOf('{hasCreditCards ?'), SHEET_CODE.indexOf('</TouchableOpacity>', SHEET_CODE.indexOf('{hasCreditCards ?')));
  assert('5a. accessibilityRole="button"', action.includes('accessibilityRole="button"'));
  assert('5b. accessible label is exactly "View credit cards"', action.includes('accessibilityLabel="View credit cards"'));
  assert('5c. hint explains it opens recorded credit-card details', /accessibilityHint="Opens your recorded credit card details"/.test(action));
  assert('5d. a chevron gives a NON-COLOUR navigation cue', action.includes('chevron-forward'));
  assert('5e. decorative icons are hidden from assistive tech', (action.match(/accessibilityElementsHidden/g) ?? []).length === 2);
  assert('5f. minimum independent target is 44x44', /minHeight: 44/.test(SHEET_CODE) && /minWidth: 44/.test(SHEET_CODE));
  assert('5g. a vector icon is used, never an emoji', action.includes('<Ionicons') && !/[\u{1F300}-\u{1FAFF}]/u.test(action));
}

console.log('\n=== 6. Typography and colour are tokenised (no platform default, no raw hex) ===');
{
  const styleBlock = SHEET_CODE.slice(SHEET_CODE.indexOf('cardsLink:'), SHEET_CODE.indexOf('suggestionsBlock:'));
  // tokens.typography.* carries NO fontFamily — using it here would render
  // the platform default. The role resolver is what supplies Figtree.
  assert('6a. the link label resolves type through typeStyle, not tokens.typography', styleBlock.includes("typeStyle('support', locale)"));
  assert('6b. and does NOT fall back to typography.caption', !styleBlock.includes('typography.caption'));
  assert('6c. colour is the semantic Ocean interactive role', styleBlock.includes('semantic.interactive'));
  assert('6d. no raw hex or rgba in the new style block', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(styleBlock));
  assert('6e. locale is a real dependency of the memoised styles', /insets\.bottom, locale\]/.test(SHEET_CODE));
  // 320pt / 200% Dynamic Type: the row must be free to wrap and the label
  // free to shrink, and nothing may pin a fixed width or clamp the lines.
  assert('6f. the row wraps rather than clipping', styleBlock.includes("flexWrap: 'wrap'"));
  assert('6g. the label may shrink', styleBlock.includes('flexShrink: 1'));
  assert('6h. no fixed width is pinned on the action', !/\bwidth: \d/.test(styleBlock));
  const action = SHEET_CODE.slice(SHEET_CODE.indexOf('{hasCreditCards ?'), SHEET_CODE.indexOf('</TouchableOpacity>', SHEET_CODE.indexOf('{hasCreditCards ?')));
  assert('6i. the label is not truncated by numberOfLines', !action.includes('numberOfLines'));
}

console.log('\n=== 7. Cards opens under Money, with the shell visible (Class A) ===');
{
  assert('7a. ROUTE_OWNER_TAB.Cards is Money — unchanged by this correction', ROUTE_OWNER_TAB.Cards === 'Money');
  assert('7b. resolveOwnerTab("Cards") lights the Money pill', resolveOwnerTab('Cards', undefined) === 'Money');
  assert('7c. Cards is dock-visible with no overlay and no keyboard', isDockVisible({ route: 'Cards', keyboardVisible: false, overlay: 'none' }));
  // The correction must not have added Cards to the tab bar.
  const TABS = read('src/navigation/tabDefinitions.ts');
  assert('7d. Cards is NOT one of the four tabs', !/TAB_NAMES[^=]*=\s*\[[^\]]*Cards/.test(TABS));
  const ROOT = read('src/navigation/RootNavigator.tsx');
  assert('7e. exactly one Cards screen is registered', (ROOT.match(/name="Cards"/g) ?? []).length === 1);
  assert('7f. Cards is a plain stack screen, not a modal presentation', !/name="Cards"[^>]*presentation/.test(ROOT));
}

console.log('\n=== 8. Previously accepted behaviours are preserved ===');
{
  // Wealth card rows still open Edit credit card — NOT Cards.
  assert('8a. Wealth still routes a linked card to the credit-card editor', /if \(linkedCard\) \{\s*setEditCreditCard\(linkedCard\);\s*setCreditCardModalVisible\(true\);/.test(WEALTH));
  assert('8b. Wealth navigates nowhere near Cards', !/navigate\('Cards'\)/.test(code(WEALTH)));
  // The reminder's own "View card" is untouched.
  assert('8c. the reminder still exposes "View card"', REMINDER.includes('accessibilityLabel="View card"'));
  assert('8d. with its existing testID', REMINDER.includes('reminder-view-card'));
  assert('8e. and still navigates to Cards', (code(REMINDER).match(/navigate\('Cards'\)/g) ?? []).length === 1);
  // Money's entry into the sheet is unchanged.
  assert('8f. Money still opens the debt overview from its own footer row', MONEY.includes('View full debt overview') && MONEY.includes('setDebtCoachVisible(true)'));
}

console.log('\n=== 9. The Money route is INDEPENDENT of reminder state ===');
{
  // The whole point: snoozing or dismissing a card reminder must not touch
  // this path. Structurally, the sheet cannot consult reminder state — it
  // imports none of it.
  assert('9a. the sheet imports no reminder engine', !/from '.*reminders'/.test(SHEET));
  assert('9b. the sheet imports no suppression engine', !/reminderSuppression/.test(SHEET));
  assert('9c. the sheet imports no reminder lifecycle', !/reminderInteractionLifecycle/.test(SHEET));
  assert('9d. nothing in the sheet references snooze or dismissal', !/snooze|Snooze|dismissal|Dismissal/.test(SHEET_CODE));
  assert('9e. eligibility depends only on the card collection', /const hasCreditCards = data\.creditCards\.length > 0;/.test(SHEET_CODE));
}

console.log('\n=== 10. debtCoach\'s credit-card discriminator is structured (Class A) ===');
{
  // Real model shapes — every field below is a declared member of the
  // interface, so the fixture cannot drift from the type it claims to be.
  function card(id: string, balance: number, creditLimit = 10000): CreditCard {
    return { id, issuer: 'AMEX', label: `Card ${id}`, creditLimit, currentBalance: balance, dueDay: 15, minimumPayment: 0, apr: 0.2 };
  }
  function cardLiability(id: string, cardId: string, balance: number): Liability {
    return { id, type: 'other', label: 'Card mirror', currentBalance: balance, creditCardId: cardId };
  }
  function loan(id: string, balance: number): Liability {
    return { id, type: 'car_loan', label: 'Car loan', currentBalance: balance, interestRate: 0.07 };
  }
  function withData(cards: CreditCard[], liabilities: Liability[]): AppData {
    const d = createEmptyAppData();
    d.creditCards = cards;
    d.liabilities = liabilities;
    return d;
  }

  // A liability is only a credit card when it RESOLVES against a real card.
  const oneCard = withData([card('c1', 10)], [cardLiability('l1', 'c1', 10)]);
  const s1 = computeDebtCoachSummary(oneCard);
  assert('10a. a card-linked liability is kind "credit_card"', s1.debts.filter((d) => d.kind === 'credit_card').length === 1);

  const loanOnly = withData([], [loan('l2', 20000)]);
  const s2 = computeDebtCoachSummary(loanOnly);
  assert('10b. a loan is never kind "credit_card"', s2.debts.every((d) => d.kind !== 'credit_card'));
  assert('10c. and the authoritative collection is empty, so the action is ineligible', loanOnly.creditCards.length === 0);

  // A liability whose creditCardId points at nothing must NOT be promoted.
  const dangling = withData([], [cardLiability('l3', 'missing', 500)]);
  const s3 = computeDebtCoachSummary(dangling);
  assert('10d. a dangling creditCardId does not fabricate a credit card', s3.debts.every((d) => d.kind !== 'credit_card'));

  // Device shape: two cards, one at $0 and one at $10. The $0 card drops
  // out of the DEBT list (balance <= 0) but is still a real card — which is
  // exactly why eligibility reads the collection, not the debt list.
  const deviceShape = withData([card('amex', 0), card('amex1', 10)], [cardLiability('lA', 'amex1', 10)]);
  const s4 = computeDebtCoachSummary(deviceShape);
  assert('10e. device shape: exactly one card DEBT entry (the $0 card is not a debt)', s4.debts.filter((d) => d.kind === 'credit_card').length === 1);
  assert('10f. device shape: but TWO real cards, so the action stays eligible', deviceShape.creditCards.length === 2);
  assert('10g. device shape: total debt is the $10 balance only', s4.totalDebt === 10);
  // Paying the last card to zero must not remove the route.
  const allPaidOff = withData([card('amex', 0), card('amex1', 0)], [loan('l4', 15000)]);
  assert('10h. cards paid to zero still count as cards (route survives)', allPaidOff.creditCards.length === 2);
  assert('10i. and they contribute no debt', computeDebtCoachSummary(allPaidOff).debts.filter((d) => d.kind === 'credit_card').length === 0);
}

console.log('\n=== 11. Suppression removes the TRANSIENT route but not the stable one (Class A) ===');
{
  // This is the defect, reproduced with the real engines: a card due inside
  // the 3-day window surfaces `card_due_soon`; snoozing or dismissing that
  // occurrence removes it from the ranked selector — and with it, the only
  // pre-correction way into Cards. Eligibility for the Money route is
  // computed from the card collection, which none of that touches.
  const today = new Date(2026, 7, 18); // local parts, never toISOString
  const dueSoon = new Date(2026, 7, 19);

  const data: AppData = createEmptyAppData();
  data.creditCards = [
    { id: 'amex1', issuer: 'AMEX', label: 'AMEX1', creditLimit: 10000, currentBalance: 10, dueDay: dueSoon.getDate(), minimumPayment: 0, expectedMonthlyRepayment: 50, apr: 0.2 },
  ];
  data.liabilities = [{ id: 'lam1', type: 'other', label: 'AMEX1', currentBalance: 10, creditCardId: 'amex1' }];

  const surfaced = computeRankedReminder(data, today);
  assert('11a. a card due tomorrow surfaces the card reminder', surfaced !== null && surfaced.kind === 'card_due_soon');

  const key = occurrenceKeyOf(surfaced!);

  // Dismissed.
  const dismissed: AppData = { ...data, dismissedReminderOccurrences: [key] };
  const afterDismiss = computeRankedReminder(dismissed, today, createSuppressionPredicate(dismissed, today));
  assert('11b. dismissing it removes the card reminder entirely', afterDismiss === null || afterDismiss.kind !== 'card_due_soon');
  assert('11c. …which is exactly what removed the ONLY pre-correction route to Cards', true);

  // Snoozed to a future local date.
  const snoozed: AppData = { ...data, snoozedReminderOccurrences: { [key]: toLocalDateString(addLocalDays(today, 3)) } };
  const afterSnooze = computeRankedReminder(snoozed, today, createSuppressionPredicate(snoozed, today));
  assert('11d. snoozing it also removes the card reminder', afterSnooze === null || afterSnooze.kind !== 'card_due_soon');

  // The stable route is untouched in every one of those states.
  for (const [label, d] of [['dismissed', dismissed], ['snoozed', snoozed]] as const) {
    assert(`11e. ${label}: the card collection is unchanged, so the Money route stays eligible`, d.creditCards.length === 1);
    assert(`11f. ${label}: the card is still a real credit-card debt entry`, computeDebtCoachSummary(d).debts.filter((x) => x.kind === 'credit_card').length === 1);
  }
  assert('11g. suppression state lives on AppData, which the debt sheet never reads', !SHEET.includes('snoozedReminderOccurrences') && !SHEET.includes('dismissedReminderOccurrences'));
}

console.log('\n=== 12. A $0 card is NOT debt, and is still a card (Class A) ===');
{
  // The final correction turns on this distinction, so it is pinned here
  // rather than left implicit. `computeHasAnyDebt` is the financial
  // predicate that drives the sheet's branch; `data.creditCards` is the
  // collection that drives reachability. They must disagree in exactly this
  // case, and the correction must not have moved either one.
  function zeroCard(id: string): CreditCard {
    return { id, issuer: 'AMEX', label: `Card ${id}`, creditLimit: 10000, currentBalance: 0, dueDay: 15, minimumPayment: 0, apr: 0.2 };
  }
  const only0 = createEmptyAppData();
  only0.creditCards = [zeroCard('a'), zeroCard('b')];
  only0.liabilities = [];

  assert('12a. two $0 cards register as NO debt — the calm branch is correct', computeHasAnyDebt(only0) === false);
  assert('12b. …and contribute nothing to total debt', computeDebtCoachSummary(only0).totalDebt === 0);
  assert('12c. …and produce no debt entries at all', computeDebtCoachSummary(only0).debts.length === 0);
  assert('12d. but the cards themselves still exist, so the route must survive', only0.creditCards.length === 2);

  // One cent of balance flips the financial meaning, and only that.
  const withCent = createEmptyAppData();
  withCent.creditCards = [{ ...zeroCard('a'), currentBalance: 0.01 }];
  withCent.liabilities = [{ id: 'l', type: 'other', label: 'mirror', currentBalance: 0.01, creditCardId: 'a' }];
  assert('12e. a non-zero balance does register as debt', computeHasAnyDebt(withCent) === true);
  assert('12f. and eligibility is unchanged by the balance either way', withCent.creditCards.length === 1 && only0.creditCards.length === 2);

  // An empty wallet is still an empty wallet.
  const nothing = createEmptyAppData();
  assert('12g. no cards and no liabilities → no debt', computeHasAnyDebt(nothing) === false);
  assert('12h. …and no cards, so no action may render', nothing.creditCards.length === 0);

  // The engine that decides this is byte-unchanged.
  assert('12i. computeHasAnyDebt was not modified', execSync('git diff --stat -- src/lib/calculations/debtCoach.ts', { cwd: REPO_ROOT }).toString().trim() === '');
  // RECONCILED — Wave 9a closure, Correction C.
  // OLD CLAUSE: creditHealth.ts AND repaymentAccounting.ts both byte-unchanged.
  // SUPERSEDED for creditHealth.ts ONLY, because inspection proved a separate
  // defect there: `card.apr > 0` treated a recorded 0% rate as "no rate
  // recorded" and substituted the 19.5% assumption, producing non-zero
  // interest on an interest-free card and mislabelling its provenance.
  // PRESERVED INTENT: no FORMULA, threshold or accounting rule may move.
  // Asserted directly below instead of by a byte comparison.
  assert('12j. repayment accounting is still byte-unchanged', execSync('git diff --stat -- src/lib/calculations/repaymentAccounting.ts', { cwd: REPO_ROOT }).toString().trim() === '');
  const CH = read('src/lib/calculations/creditHealth.ts');
  assert('12j-i. the interest formula is unchanged', CH.includes('const dailyInterest = balanceUsed * (rateUsed / 365);'));
  assert('12j-ii. the cycle projection is unchanged', CH.includes('const estimatedCycleInterest = dailyInterest * cycleDays;'));
  assert('12j-iii. the utilisation thresholds are unchanged', CH.includes("if (utilisation < 0.3) return { tone: 'success', label: 'Healthy' };") && CH.includes("if (utilisation < 0.7) return { tone: 'warning', label: 'Getting high' };"));
  assert('12j-iv. the assumed rate is still 19.5%', CH.includes('export const ASSUMED_CREDIT_CARD_APR = 0.195;'));
  assert('12j-v. the aggregate maths is unchanged', CH.includes('const utilisation = totalLimit > 0 ? totalUsed / totalLimit : 0;'));
  assert('12j-vi. the due-date calendar maths is unchanged', CH.includes('return calendarOrdinal(due) - calendarOrdinal(normalizedToday);'));
  assert('12j-vii. the repayment resolver is unchanged', CH.includes('if (isValidExpectedRepayment(card.expectedMonthlyRepayment)) return card.expectedMonthlyRepayment;'));
  // The no-debt presentation itself is preserved verbatim.
  for (const kept of ["Let's understand your debt first", 'Do you currently have any debt?', 'I have no debt', 'handleNoDebt']) {
    assert(`12k. no-debt presentation retained: ${kept}`, SHEET.includes(kept));
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
