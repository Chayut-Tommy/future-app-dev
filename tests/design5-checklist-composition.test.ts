// Post-Wave-10 checklist UX closure — the PURE composition matrix and the
// card's structural contract. The composition is the real imported
// lib/setupChecklist module (never mirrored); the card pins are structural
// (the component itself cannot load outside the RN runtime; the journeys
// are rendered in design5-checklist-redesign.render.test.tsx).
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  SETUP_STEP_PRIORITY,
  SetupStepComposition,
  composeSetupChecklist,
  resolveNextSetupStep,
  supersedeSetupAcknowledgements,
} from '../src/lib/setupChecklist';
import { AppData, AssetType } from '../src/types/models';
import { ASSET_LABEL_PLACEHOLDER } from '../src/lib/assetPlaceholders';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let total = 0;
let failures = 0;
function assert(name: string, cond: boolean) {
  total++;
  if (cond) console.log(`PASS — ${name}`);
  else {
    failures++;
    console.log(`FAIL — ${name}`);
  }
}

type Key = SetupStepComposition['key'];
const KEYS = SETUP_STEP_PRIORITY as readonly Key[];
function make(overrides: Partial<Record<Key, Partial<SetupStepComposition>>> = {}): SetupStepComposition[] {
  return KEYS.map((key) => ({ key, completed: false, acknowledged: false, ...(overrides[key] ?? {}) }));
}

console.log('=== 1. Locked order and grouping ===');
{
  const c = composeSetupChecklist(make());
  assert('1a. the seven tasks keep the locked order income -> everyday -> savings -> assets -> bills -> debt -> goal', JSON.stringify(c.order) === JSON.stringify(['income', 'everyday', 'cash', 'assets', 'bills', 'debt', 'goal']));
  assert('1b. the first four are the core group; bills/debt/goal sit under "Add when it applies"', JSON.stringify(c.coreKeys) === JSON.stringify(['income', 'everyday', 'cash', 'assets']) && JSON.stringify(c.whenItAppliesKeys) === JSON.stringify(['bills', 'debt', 'goal']));
  assert('1c. total is seven', c.total === 7);
}

console.log('\n=== 2. Zero state ===');
{
  const c = composeSetupChecklist(make());
  assert('2a. zero progress renders expanded (zeroProgress true, nothing resolved)', c.zeroProgress && c.resolvedCount === 0 && !c.allResolved);
  assert('2b. progress copy is honest at zero: "0 of 7 complete"', c.progressLabel === '0 of 7 complete' && c.progressRatio === 0);
  assert('2c. the next task is income and the compact subset is the next two', c.nextKey === 'income' && JSON.stringify(c.compactKeys) === JSON.stringify(['income', 'everyday']));
}

console.log('\n=== 3. Each single task completed independently ===');
for (const key of KEYS) {
  const c = composeSetupChecklist(make({ [key]: { completed: true } }));
  const expectedNext = KEYS.find((k) => k !== key)!;
  assert(`3-${key}. completing only ${key} resolves exactly one step, reads "1 of 7 complete", and the resolver skips it`, c.resolvedCount === 1 && c.completedCount === 1 && c.progressLabel === '1 of 7 complete' && !c.zeroProgress && c.nextKey === expectedNext && !c.compactKeys.includes(key));
}

console.log('\n=== 4. Mixed, deferred and no-debt states ===');
{
  const c = composeSetupChecklist(make({ income: { completed: true }, cash: { completed: true }, everyday: { acknowledged: true } }));
  assert('4a. partial mixed state counts completed AND acknowledged as resolved', c.resolvedCount === 3 && c.completedCount === 2);
  assert('4b. any acknowledgement in the numerator switches the wording to "reviewed" — a deferred step is never called complete', c.progressLabel === '3 of 7 reviewed');
  assert('4c. the next task honours the locked order past resolved steps', c.nextKey === 'assets' && JSON.stringify(c.compactKeys) === JSON.stringify(['assets', 'bills']));

  const deferredOnly = composeSetupChecklist(make({ goal: { acknowledged: true } }));
  assert('4d. an explicit deferral alone reads "1 of 7 reviewed" and the resolver skips the deferred step', deferredOnly.progressLabel === '1 of 7 reviewed' && deferredOnly.nextKey === 'income' && !deferredOnly.compactKeys.includes('goal'));

  const noDebt = composeSetupChecklist(make({ debt: { acknowledged: true } }));
  assert('4e. the explicit no-debt acknowledgement resolves the debt step without calling it complete', noDebt.resolvedCount === 1 && noDebt.completedCount === 0 && noDebt.progressLabel === '1 of 7 reviewed');

  const dataDebt = composeSetupChecklist(make({ debt: { completed: true } }));
  assert('4f. real recorded debt is a data-backed completion ("1 of 7 complete")', dataDebt.progressLabel === '1 of 7 complete');
}

console.log('\n=== 5. All-resolved states ===');
{
  const allCompleted = composeSetupChecklist(make(Object.fromEntries(KEYS.map((k) => [k, { completed: true }]))));
  assert('5a. all data-backed reads "7 of 7 complete" and retires the list (allResolved, no next, empty compact)', allCompleted.allResolved && allCompleted.progressLabel === '7 of 7 complete' && allCompleted.nextKey === null && allCompleted.compactKeys.length === 0);
  const mixedResolved = composeSetupChecklist(make({ income: { completed: true }, everyday: { completed: true }, cash: { completed: true }, assets: { acknowledged: true }, bills: { acknowledged: true }, debt: { acknowledged: true }, goal: { acknowledged: true } }));
  assert('5b. completed + acknowledged everywhere is still fully resolved but reads "7 of 7 reviewed"', mixedResolved.allResolved && mixedResolved.progressLabel === '7 of 7 reviewed');
  assert('5c. the ratio is truthful at 0, partial and finished', composeSetupChecklist(make()).progressRatio === 0 && composeSetupChecklist(make({ income: { completed: true } })).progressRatio === 1 / 7 && allCompleted.progressRatio === 1);
}

console.log('\n=== 6. Continue-next-task resolver (the shared authority) ===');
{
  const steps = KEYS.map((key) => ({ key, done: key === 'income' || key === 'everyday' }));
  assert('6a. resolveNextSetupStep still walks the SAME locked priority and skips resolved steps', resolveNextSetupStep(steps)?.key === 'cash');
  assert('6b. a deferred (done) step can never become the CTA target', resolveNextSetupStep(KEYS.map((key) => ({ key, done: key !== 'goal' })))?.key === 'goal' && resolveNextSetupStep(KEYS.map((key) => ({ key, done: true }))) === null);
}

console.log('\n=== 7. Card structure — one action per row, chips, grouping, no extras ===');
{
  const CARD = read('src/components/today/MoneyPictureChecklistCard.tsx');
  const CARD_CODE = code(CARD);
  assert('7a. the header keeps the approved copy and the checklist owns NO Settings control', /Complete your money setup/.test(CARD_CODE) && /Add a few more details to make Today, Money and Wealth more useful\./.test(CARD_CODE) && !/settings/i.test(CARD_CODE));
  assert('7b. the whole row is ONE button; chip and icons are a11y-hidden decoration inside it', /accessibilityLabel=\{`\$\{s\.title\}\. \$\{s\.chip\}\. \$\{s\.status\}`\}/.test(CARD_CODE) && /accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/.test(CARD_CODE));
  assert('7c. chips: incomplete "Add now", truthful completed default "Added", neutral "Later"; the no-debt chip is the truthful "Debt-free"', /'Add now'/.test(CARD_CODE) && /\?\? 'Added'/.test(CARD_CODE) && /\?\? 'Later'/.test(CARD_CODE) && /'Debt-free'/.test(CARD_CODE));
  assert('7d. green appears ONLY on the genuinely completed chip (successTint); later/add-now chips use neutral tokens', /chipDone: \{ backgroundColor: semantic\.successTint/.test(CARD_CODE) && /chipLater: \{ backgroundColor: colors\.surfaceMuted/.test(CARD_CODE) && /chipAdd: \{ backgroundColor: colors\.accentSoft/.test(CARD_CODE));
  assert('7e. the quiet divider is exactly "Add when it applies" and the dismissive "Not right now?" never appears', /Add when it applies/.test(CARD_CODE) && !/Not right now/.test(CARD_CODE));
  // RECONCILED (visual-rhythm correction): the deferral is now the task
  // group's ATTACHED footer — still its own separate sibling Pressable,
  // now contained inside the same group as its primary row. Pinned in
  // detail in section 9 below.
  assert('7f. deferral is its own clearly separate sibling action attached inside the task group — never nested inside the row button', /renderFooter/.test(CARD_CODE) && /groupFooter/.test(CARD_CODE) && !/renderFooter\(s\)[\s\S]{0,200}<\/TouchableOpacity>\s*\n\s*\)\s*;\s*\n\s*\}\s*\n\s*function renderRow/.test(CARD_CODE));
  assert('7g. rows share a base 76pt minimum (title + two support lines); the disclosure and defer targets at least 44pt; the CTA at least 52pt', /minHeight: 76/.test(CARD_CODE) && (CARD_CODE.match(/minHeight: 44/g) ?? []).length >= 2 && /minHeight: 52/.test(CARD_CODE));
  assert('7h. NO bottom gift/promo tile, no reward teaser, no new route', !/gift/i.test(CARD_CODE) && !/Set up more things/i.test(CARD_CODE) && !/get more insights/i.test(CARD_CODE));
  assert('7i. no vague time promise on the CTA', !/few minutes|only takes/i.test(CARD_CODE));
  assert('7j. the CTA is the featured gradient with sparkle + chevron and a dynamic Next line', /name="sparkles"/.test(CARD_CODE) && /semantic\.featured\[0\], semantic\.featured\[1\]/.test(CARD_CODE) && /`Next: \$\{nextSetupStep\.title\}`/.test(CARD_CODE) && /chevron-forward/.test(CARD_CODE));
  assert('7k. the compact card shows the composition subset with ONE "View all setup steps" disclosure', /composition\.compactKeys/.test(CARD_CODE) && /View all setup steps/.test(CARD_CODE) && /setViewAll\(true\)/.test(CARD_CODE));
  assert('7l. expansion is local presentation state — never persisted, no storage write for it', /useState\(false\)/.test(CARD_CODE) && !/updateUser\([^)]*viewAll/i.test(CARD_CODE) && !/AsyncStorage/.test(CARD_CODE));
  assert('7m. one Today scroll owner: no nested ScrollView and no checklist-owned Modal presentation', !/ScrollView/.test(CARD_CODE) && !/<Modal/.test(CARD_CODE));
  assert('7n. Continue and rows only OPEN canonical surfaces — tapping them writes nothing (writes exist only on explicit defer/dismiss handlers)', /setWorkspaceKind\('income'\)/.test(CARD_CODE) && /setCompleteIncomeVisible\(true\)/.test(CARD_CODE) && /onAdd: \(\) => setWorkspaceKind\('everyday'\)/.test(CARD_CODE) && /onAdd: \(\) => setWorkspaceKind\('savings'\)/.test(CARD_CODE) && /onAdd: \(\) => setWorkspaceKind\('vehicle'\)/.test(CARD_CODE) && /onAdd: \(\) => setWorkspaceKind\('bill'\)/.test(CARD_CODE) && /onAdd: \(\) => setDebtCoachVisible\(true\)/.test(CARD_CODE) && /onAdd: \(\) => setGoalModalVisible\(true\)/.test(CARD_CODE));
  assert('7o. focus restores to the initiating Continue/row control when a task surface closes — no timer coordination anywhere', /focusElement\(originRef\.current\)/.test(CARD_CODE) && !/setTimeout|setInterval|Date\.now/.test(CARD_CODE));
  assert('7p. the supporting copy stays the approved factual product descriptions', ['Places expected pay in your timeline.', 'Gives Available until payday a balance to work from.', 'Shows money you have set aside.', 'Adds vehicles, property or investments to your net worth.', 'Keeps upcoming costs visible.', 'Keeps what you owe visible.', 'Optional — track a target if useful.'].every((line) => CARD_CODE.includes(line)));
}

console.log('\n=== 8. B9 — canonical Save-feedback carry-over closure ===');
{
  const WEALTH = code(read('src/components/wealth/AddWealthItemModal.tsx'));
  const SHEET = code(read('src/components/navigation/AddAnythingSheet.tsx'));
  assert('8a. the wealth form reports the ACTUAL saved structured type to the host', /onSaveSuccess\?\.\(kind === 'asset' \? assetType : liabilityType\);/.test(WEALTH));
  assert('8b. the host names the confirmation from the ACTUAL saved type, never only the entry preset', /function handleSaveSuccessClose\(savedType\?: AssetType \| LiabilityType\)/.test(SHEET) && /routeDisplayName\(savedRoute, savedType\)/.test(SHEET));
  assert('8c. a standalone wealth save earns the same canonical feedback, named from the actual type, added vs updated truthfully', /confirmSaveSuccess\(\s*\n\s*buildSaveConfirmation\(\s*\n\s*kind === 'asset' \? assetDisplayName\(assetType\) : LIABILITY_DISPLAY_NAME\[liabilityType\],\s*\n\s*editAsset \|\| editLiability \? 'updated' : 'added'/.test(WEALTH));
  assert('8d. standalone card saves route through the boundary BEFORE the debt-reduced celebration (so the celebration claims the plain toast)', /if \(!embedded\) confirmSaveSuccess\(buildSaveConfirmation\('Credit card', 'updated'\)\);\s*\n\s*if \(payload\.currentBalance < editCard\.currentBalance\) celebrate\(/.test(code(read('src/components/credit/AddCreditCardModal.tsx'))));
  assert('8e. standalone QuickAdd transaction saves confirm from the structured type, updated vs recorded truthfully', /buildSaveConfirmation\(type === 'expense' \? 'Expense' : 'Income', editTransaction \? 'updated' : 'recorded'\)/.test(code(read('src/components/dashboard/QuickAddModal.tsx'))));
  assert('8f. standalone goal adds confirm through the same boundary', /confirmSaveSuccess\(buildSaveConfirmation\('Goal', 'added'\)\);/.test(code(read('src/components/goals/AddGoalModal.tsx'))));
  assert('8g. goal-edit commits fire the one softSuccess through the boundary while the in-sheet flash stays the single factual confirmation', /function flashSaved\(\) \{\s*\n\s*confirmSaveSuccess\(\);/.test(code(read('src/components/goals/GoalDetailSheet.tsx'))));
  assert('8h. the confirmation verb vocabulary is exactly added/recorded/updated', /'added' \| 'recorded' \| 'updated'/.test(read('src/lib/celebrations.ts')));
}

console.log('\n=== 9. Visual rhythm — contained task groups ===');
{
  const CARD = read('src/components/today/MoneyPictureChecklistCard.tsx');
  const CARD_CODE = code(CARD);
  const groupBody = CARD_CODE.slice(CARD_CODE.indexOf('function renderGroup'), CARD_CODE.indexOf('const compactSteps'));
  const footerBody = CARD_CODE.slice(CARD_CODE.indexOf('function renderFooter'), CARD_CODE.indexOf('function renderGroup'));
  assert('9a. all seven rows share ONE geometry/style authority: a single styles.row, rendered only through renderGroup, used by compact AND expanded', (CARD_CODE.match(/row: \{/g) ?? []).length === 1 && /coreSteps\.map\(renderGroup\)/.test(CARD_CODE) && /laterSteps\.map\(renderGroup\)/.test(CARD_CODE) && /compactSteps\.map\(renderGroup\)/.test(CARD_CODE) && !/\.map\(\(s\) => renderRow/.test(CARD_CODE));
  assert('9b. ONE exterior gap authority — the task list gap; groups, rows and footers carry no margins of their own', /taskList: \{ gap: spacing\.sm \}/.test(CARD_CODE) && !/margin/.test(CARD_CODE.slice(CARD_CODE.indexOf('taskGroup: {'), CARD_CODE.indexOf('iconTile: {'))) && !/margin/.test(CARD_CODE.slice(CARD_CODE.indexOf('groupFooter: {'), CARD_CODE.indexOf('deferText:'))));
  assert('9c. every secondary choice lives INSIDE its owning task group — renderFooter is invoked only from renderGroup, and the old loose sub-row action is gone', (CARD_CODE.match(/renderFooter\(s\)/g) ?? []).length === 1 && /\{renderRow\(s\)\}\s*\n\s*\{renderFooter\(s\)\}/.test(groupBody) && !/renderDefer|deferButton/.test(CARD_CODE));
  assert('9d. the group wrapper is a plain View — the row and footer are sibling Pressables, never a Pressable inside a Pressable', /<View key=\{s\.key\} style=\{styles\.taskGroup\}/.test(groupBody) && !/TouchableOpacity|Pressable/.test(groupBody.slice(0, groupBody.indexOf('{renderRow'))));
  assert('9e. the footer invokes ONLY its existing structured writer and carries no chevron or navigation affordance', /onPress=\{s\.defer\.onDefer\}/.test(footerBody) && !/Ionicons|chevron/.test(footerBody));
  assert('9f. a task without a secondary choice gets NO placeholder — the footer renders nothing when absent or resolved', /if \(s\.done \|\| !s\.defer\) return null;/.test(footerBody));
  assert('9g. footer anatomy: quiet hairline divider, compact padding, 44pt target, label aligned to the text column', /borderTopWidth: StyleSheet\.hairlineWidth/.test(CARD_CODE) && /minHeight: 44/.test(CARD_CODE.slice(CARD_CODE.indexOf('groupFooter: {'), CARD_CODE.indexOf('deferText:'))) && /paddingVertical: spacing\.xs/.test(CARD_CODE) && /paddingLeft: spacing\.md \+ 36 \+ spacing\.sm/.test(CARD_CODE));
  assert('9h. the footer label names its task context for VoiceOver', /accessibilityLabel=\{`\$\{s\.title\}\. \$\{s\.defer\.label\}`\}/.test(footerBody));
  assert('9i. the group surface is a subtle semantic hairline border — no shadow, no raw colour, no fill that would sink the chips', /borderWidth: StyleSheet\.hairlineWidth,\s*\n\s*borderColor: colors\.border,\s*\n\s*borderRadius: radius\.control/.test(CARD_CODE) && !/shadow/i.test(CARD_CODE.slice(CARD_CODE.indexOf('taskGroup: {'), CARD_CODE.indexOf('iconTile: {'))) && !/#[0-9A-Fa-f]{3,8}/.test(CARD_CODE));
  assert('9j. the divider sits inside the same gapped list with balanced spacing — no attached margins of its own', !/margin/.test(CARD_CODE.slice(CARD_CODE.indexOf('divider: {'), CARD_CODE.indexOf('dividerLine:'))) && /\{coreSteps\.map\(renderGroup\)\}\s*\n\s*<View style=\{styles\.divider\}/.test(CARD_CODE));
  assert('9k. no fixed heights anywhere in the group anatomy — content can only grow (minHeight, never height)', !/\bheight:/.test(CARD_CODE.slice(CARD_CODE.indexOf('taskList: {'), CARD_CODE.indexOf('iconTile: {'))) && !/\bheight:/.test(CARD_CODE.slice(CARD_CODE.indexOf('groupFooter: {'), CARD_CODE.indexOf('deferText:'))));
  assert('9l. the bottom task clears the dock through the EXISTING shared Screen clearance authority (untouched)', /paddingBottom: screenBottomClearance\(insets\.bottom\)/.test(read('src/components/shared/Screen.tsx')) && /DOCK_HEIGHT \+ DOCK_BOTTOM_SPACING/.test(read('src/navigation/floatingNavGeometry.ts')));
  const writers = CARD_CODE.match(/onDefer: \(\) => updateUser\(\{ \w+: true \}\)/g) ?? [];
  assert('9m. six footer writers are constant-flag structured updates (idempotent by construction) and the seventh is the ONE shared no-debt authority', writers.length === 6 && ['confirmedNoIncome', 'confirmedEverydayLater', 'confirmedNoSavings', 'confirmedCashOnly', 'confirmedBillsLater', 'confirmedGoalLater'].every((f) => CARD_CODE.includes(`updateUser({ ${f}: true })`)) && /onDefer: \(\) => confirmNoDebt\(\{ updateUser, confirmSaveSuccess, celebrate \}\)/.test(CARD_CODE));
}

console.log('\n=== 10. Consistency correction — seven footers, supersede lifecycle, placeholder ===');
{
  const CARD = read('src/components/today/MoneyPictureChecklistCard.tsx');
  const CARD_CODE = code(CARD);
  // 10a — the owner-locked seven-footer matrix, label for label.
  const MATRIX: [string, string][] = [
    ["I don't have income yet", 'confirmedNoIncome'],
    ["I'll add an account later", 'confirmedEverydayLater'],
    ["I don't have savings yet", 'confirmedNoSavings'],
    ["I don't have other assets yet", 'confirmedCashOnly'],
    ["I'll add bills later", 'confirmedBillsLater'],
    ["I'll add a goal later", 'confirmedGoalLater'],
  ];
  assert('10a. all six flag-writing footers carry the locked labels over their exact existing/authorised writers', MATRIX.every(([label, flag]) => CARD_CODE.includes(`label: "${label}", onDefer: () => updateUser({ ${flag}: true })`)));
  assert('10b. the seventh footer is the Debt one, routed through the ONE shared no-debt authority', CARD_CODE.includes(`label: "I don't have any debt", onDefer: () => confirmNoDebt({ updateUser, confirmSaveSuccess, celebrate })`));
  const NODEBT = code(read('src/lib/noDebtConfirmation.ts'));
  assert('10c. the shared authority is one write + one action feedback + one celebration, used by BOTH entry points', /updateUser\(\{ confirmedNoDebt: true \}\);/.test(NODEBT) && /confirmSaveSuccess\(\);/.test(NODEBT) && /celebrate\(buildDebtFreeCelebration\(\)\);/.test(NODEBT) && /confirmNoDebt\(\{ updateUser, confirmSaveSuccess, celebrate \}\);/.test(code(read('src/components/debt/DebtCoachSheet.tsx'))) && !/updateUser\(\{ confirmedNoDebt: true \}\)/.test(code(read('src/components/debt/DebtCoachSheet.tsx'))));
  assert('10d. the savings acknowledgement is a bare setup-flag write — no toast, no haptic, no celebration on its path', !/confirmSaveSuccess|celebrate/.test(CARD_CODE.slice(CARD_CODE.indexOf("key: 'cash'"), CARD_CODE.indexOf("key: 'assets'"))));
  assert('10e. the model extension is one optional backward-compatible flag, read by NO financial calculation', /confirmedNoSavings\?: boolean;/.test(read('src/types/models.ts')) && !/confirmedNoSavings/.test(read('src/lib/calculations/luluScore.ts')) && !/confirmedNoSavings/.test(read('src/lib/calculations/safeToSpend.ts')) && !/confirmedNoSavings/.test(read('src/lib/calculations/liquidAssets.ts')) && !/confirmedNoSavings/.test(read('src/lib/storage.ts')));

  // 10f-10k — the REAL supersede authority, driven directly.
  const base = { user: {}, assets: [], liabilities: [], creditCards: [] } as unknown as AppData;
  const withState = (user: object, extra: object = {}) => ({ ...base, ...extra, user: { ...base.user, ...user } }) as AppData;
  const savStale = withState({ confirmedNoSavings: true }, { assets: [{ type: 'savings', currentValue: 0 }] });
  assert('10f. recording real Savings clears the stale no-savings acknowledgement', supersedeSetupAcknowledgements(savStale).user.confirmedNoSavings === false);
  const savHonest = withState({ confirmedNoSavings: true }, { assets: [{ type: 'cash', currentValue: 5 }] });
  assert('10g. without real Savings the acknowledgement stands untouched (cash is not savings)', supersedeSetupAcknowledgements(savHonest) === savHonest);
  const debtStale = withState({ confirmedNoDebt: true }, { liabilities: [{ currentBalance: 100 }] });
  const debtStaleCard = withState({ confirmedNoDebt: true }, { creditCards: [{ currentBalance: 50 }] });
  assert('10h. recording real debt (liability OR card) clears the stale debt-free declaration', supersedeSetupAcknowledgements(debtStale).user.confirmedNoDebt === false && supersedeSetupAcknowledgements(debtStaleCard).user.confirmedNoDebt === false);
  assert('10i. a zero-balance record does not clear an honest declaration', supersedeSetupAcknowledgements(withState({ confirmedNoDebt: true }, { liabilities: [{ currentBalance: 0 }] })).user.confirmedNoDebt === true);
  assert('10j. the function is idempotent and identity-preserving when nothing applies', supersedeSetupAcknowledgements(base) === base && supersedeSetupAcknowledgements(supersedeSetupAcknowledgements(savStale)).user.confirmedNoSavings === false);
  const cleared = supersedeSetupAcknowledgements(withState({ confirmedNoSavings: true, confirmedGoalLater: true, monthlyIncome: 123 }, { assets: [{ type: 'savings', currentValue: 1 }] }));
  assert('10k. clearing touches ONLY the superseded flag — every other field is untouched', cleared.user.confirmedGoalLater === true && (cleared.user as { monthlyIncome?: number }).monthlyIncome === 123);
  // With the flag cleared, deleting the last Savings item CANNOT resurrect
  // the answer: the composition sees not-completed + not-acknowledged.
  const afterDelete = composeSetupChecklist(make(Object.fromEntries(KEYS.filter((k) => k !== 'cash').map((k) => [k, { completed: true }]))));
  assert('10l. after data superseded the flag, deletion returns the task to UNRESOLVED (never a stale Noted)', afterDelete.nextKey === 'cash' && afterDelete.compactKeys.includes('cash') && !afterDelete.allResolved);
  assert('10m. the persist pipeline applies the supersede in BOTH write paths', (code(read('src/state/AppStateContext.tsx')).match(/supersedeSetupAcknowledgements\(withIncome\)/g) ?? []).length === 2);

  // 10n — RECONCILED (pre-checkpoint copy correction): the placeholder now
  // resolves through the ONE exhaustive mapping authority, keyed by the
  // structured selected type only.
  const WEALTH = code(read('src/components/wealth/AddWealthItemModal.tsx'));
  assert('10n. the form derives the label placeholder ONLY from the structured selected type, through the one mapping authority', /placeholder=\{kind === 'asset' \? ASSET_LABEL_PLACEHOLDER\[assetType\] : nameField\?\.placeholder \?\? 'e\.g\. Home loan'\}/.test(WEALTH) && !/'e\.g\. Vanguard ETF'/.test(WEALTH));

  // The exhaustive mapping itself — the REAL imported authority.
  const REQUIRED: [AssetType, string][] = [
    ['everyday', 'e.g. Main everyday account'],
    ['savings', 'e.g. Emergency fund'],
    ['etf', 'e.g. Vanguard ETF'],
    ['property', 'e.g. Richmond home'],
    ['car', 'e.g. Toyota Corolla'],
    ['super', 'e.g. AustralianSuper'],
    ['cash', 'e.g. Wallet cash'],
  ];
  assert('10o. every owner-required example is exact', REQUIRED.every(([t, v]) => ASSET_LABEL_PLACEHOLDER[t] === v));
  const ALL_TYPES: AssetType[] = ['cash', 'savings', 'everyday', 'etf', 'shares', 'super', 'crypto', 'property', 'business', 'car', 'furniture', 'collectibles', 'other'];
  assert('10p. the mapping is exhaustive over the full structured union — every type has its own non-empty example', ALL_TYPES.every((t) => typeof ASSET_LABEL_PLACEHOLDER[t] === 'string' && ASSET_LABEL_PLACEHOLDER[t].startsWith('e.g. ')));
  assert('10q. no unrelated type falls back to the Investment example — only etf carries it', ALL_TYPES.filter((t) => ASSET_LABEL_PLACEHOLDER[t] === 'e.g. Vanguard ETF').join(',') === 'etf');
  assert('10r. all thirteen examples are distinct (no silent shared fallback)', new Set(ALL_TYPES.map((t) => ASSET_LABEL_PLACEHOLDER[t])).size === ALL_TYPES.length);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
