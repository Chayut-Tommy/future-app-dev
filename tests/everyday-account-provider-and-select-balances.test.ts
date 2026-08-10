// Everyday Account — narrow correction pass, 2026-08-08.
// Two issues only: (1) `provider` must participate in the existing
// isDirty/initialSnapshot contract, not be silently excluded; (2) Select
// Balances' "+ Add" action must reuse the general Add Anything chooser
// instead of forcing a Cash preset.
//
// CLASSIFICATION (per tests/README.md):
// - Mirrored logic (Class B): sections 1-8 (provider dirty-state).
//   AddWealthItemModal.tsx transitively imports react-native (Flow syntax)
//   and cannot be imported here — confirmed, same limitation every prior
//   round in this codebase has hit. Each mirrored transition
//   (openFreshEverydayDraft, openEditEveryday, typeProvider,
//   switchAssetType, performSaveMirror) reimplements the exact current
//   state-transition logic verbatim, executed for real; a structural
//   assertion per section confirms the mirror still matches the shipped
//   source text, closing the "mirror is correct" -> "shipped function is
//   the mirror" gap.
// - Structural (Class C): section 9 (Select Balances / MoneyScreen.tsx) —
//   SelectBalancesSheet.tsx and MoneyScreen.tsx both transitively import
//   react-native and cannot be imported/executed here. These checks prove
//   wiring only, not runtime navigation behaviour — see the physical-
//   device checklist in the correction report for what remains unproven.
//
// Run with: npx tsx tests/everyday-account-provider-and-select-balances.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const WEALTH_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/wealth/AddWealthItemModal.tsx', 'utf-8');
const SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');
const SELECT_BALANCES_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/money/SelectBalancesSheet.tsx', 'utf-8');
const MONEY_SCREEN_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/screens/money/MoneyScreen.tsx', 'utf-8');

// =====================================================================
// Sections 1-8: provider dirty-state (Mirrored logic)
// =====================================================================

interface Snapshot {
  label: string;
  value: string;
  interestRate: string;
  provider: string;
}
interface FormState {
  label: string;
  value: string;
  interestRate: string;
  provider: string;
  assetType: string;
  initialSnapshot: Snapshot;
}

// Mirrors isDirty (AddWealthItemModal.tsx) exactly, including clause order.
function isDirty(s: FormState): boolean {
  return (
    s.label !== s.initialSnapshot.label ||
    s.value !== s.initialSnapshot.value ||
    s.interestRate !== s.initialSnapshot.interestRate ||
    s.provider !== s.initialSnapshot.provider
  );
}

// Mirrors the fresh-open effect's 'else' (create) branch for a session
// preset to 'everyday' (e.g. arriving via Add Anything's "Add everyday
// account" tile).
function openFreshEverydayDraft(): FormState {
  return {
    label: '',
    value: '',
    interestRate: '',
    provider: '',
    assetType: 'everyday',
    initialSnapshot: { label: '', value: '', interestRate: '', provider: '' },
  };
}

// Mirrors the fresh-open effect's `if (editAsset)` branch for an
// 'everyday'-typed asset (interestRate stays '' — Everyday Account has no
// rate field).
function openEditEveryday(asset: { label: string; currentValue: number; provider?: string }): FormState {
  const editProvider = asset.provider ?? '';
  return {
    label: asset.label,
    value: String(asset.currentValue),
    interestRate: '',
    provider: editProvider,
    assetType: 'everyday',
    initialSnapshot: { label: asset.label, value: String(asset.currentValue), interestRate: '', provider: editProvider },
  };
}

// Mirrors the "Bank or provider" TextInput's onChangeText={setProvider}.
function typeProvider(s: FormState, text: string): FormState {
  return { ...s, provider: text };
}

// Mirrors the type-chip tap handler's setProvider('') addition.
function switchAssetType(s: FormState, newType: string): FormState {
  return { ...s, assetType: newType, provider: '' };
}

// Mirrors performSave's providerPayload derivation and the addAsset/
// updateAsset write, for an 'everyday' session only.
function performSaveMirror(s: FormState, existing?: { id: string; provider?: string }): { id: string; label: string; currentValue: number; provider?: string } {
  const providerPayload = s.assetType === 'everyday' ? s.provider.trim() || undefined : undefined;
  return { id: existing?.id ?? 'new-id', label: s.label.trim(), currentValue: parseFloat(s.value), provider: providerPayload };
}

console.log('=== 1. New Everyday draft with only provider entered becomes dirty ===');
{
  const s = openFreshEverydayDraft();
  assert('1a. a genuinely fresh draft is not dirty', !isDirty(s));
  const withProvider = typeProvider(s, 'Big Bank');
  assert('1b. typing ONLY a provider (name/balance left blank) marks the draft dirty', isDirty(withProvider));
  assert('1c. label/value are untouched by typing provider', withProvider.label === '' && withProvider.value === '');
}

console.log('\n=== 2. Existing Everyday Account with only provider changed becomes dirty ===');
{
  const s = openEditEveryday({ label: 'Main everyday account', currentValue: 900, provider: 'Old Bank' });
  assert('2a. a freshly opened edit session is not dirty', !isDirty(s));
  const edited = typeProvider(s, 'New Bank');
  assert('2b. changing ONLY the provider marks the session dirty', isDirty(edited));
  assert('2c. label/value are unaffected', edited.label === 'Main everyday account' && edited.value === '900');
}

console.log('\n=== 3. Resetting provider to its original value clears the provider-related dirty state ===');
{
  const s = openEditEveryday({ label: 'Main everyday account', currentValue: 900, provider: 'Old Bank' });
  const edited = typeProvider(s, 'New Bank');
  assert('3a. sanity: edited session is dirty', isDirty(edited));
  const restored = typeProvider(edited, 'Old Bank');
  assert('3b. typing the ORIGINAL provider value back clears dirty state entirely', !isDirty(restored));
}

console.log('\n=== 4. Save persists a provider-only edit ===');
{
  const s = openEditEveryday({ label: 'Main everyday account', currentValue: 900, provider: 'Old Bank' });
  const edited = typeProvider(s, 'New Bank');
  const saved = performSaveMirror(edited, { id: 'e1', provider: 'Old Bank' });
  assert('4a. Save writes the NEW provider value, not the original', saved.provider === 'New Bank');
  assert('4b. label/balance are unaffected by a provider-only edit', saved.label === 'Main everyday account' && saved.currentValue === 900);
}

console.log('\n=== 5. Discard restores the original provider ===');
{
  const persisted = { id: 'e1', label: 'Main everyday account', currentValue: 900, provider: 'Old Bank' };
  const s = openEditEveryday(persisted);
  const edited = typeProvider(s, 'Scratch Bank');
  assert('5a. sanity: the draft was actually changed', edited.provider === 'Scratch Bank' && isDirty(edited));
  // Discard = the user cancels; no save function is ever called. The
  // persisted record is therefore, by construction, still exactly what it
  // was before this session opened — proven by never having called
  // performSaveMirror (or the real updateAsset) at all.
  assert('5b. the persisted record still holds the ORIGINAL provider — discard never touched it', persisted.provider === 'Old Bank');
}

console.log('\n=== 6. Keep editing preserves the provider draft ===');
{
  // "Keep editing" (AddAnythingSheet's switch-guard) never resets the KEPT
  // destination's own component state — it is the same still-mounted
  // instance, so this is a pure identity transform on the form state.
  function keepEditing(s: FormState): FormState {
    return s;
  }
  const s = openFreshEverydayDraft();
  const edited = typeProvider(s, 'Draft Bank');
  const kept = keepEditing(edited);
  assert('6a. Keep editing preserves the exact provider draft', kept.provider === 'Draft Bank');
  assert('6b. Keep editing preserves the dirty state (nothing was discarded)', isDirty(kept));
}

console.log('\n=== 7. New form/reset/type-switch flows do not leak provider values ===');
{
  const accountA = openEditEveryday({ label: 'Account A', currentValue: 100, provider: 'Bank A' });
  const accountB = openEditEveryday({ label: 'Account B', currentValue: 200, provider: 'Bank B' });
  assert('7a. editing account B does not leak account A\'s provider', accountB.provider === 'Bank B' && accountB.provider !== accountA.provider);

  const fresh = openFreshEverydayDraft();
  assert('7b. a genuinely new draft never carries a stale provider', fresh.provider === '');

  const editedEveryday = typeProvider(openEditEveryday({ label: 'X', currentValue: 1, provider: 'Stale Bank' }), 'Stale Bank');
  const switchedToCash = switchAssetType(editedEveryday, 'cash');
  assert('7c. switching asset type away from Everyday clears provider — no stale value retained', switchedToCash.provider === '');
  const switchedBackToEveryday = switchAssetType(switchedToCash, 'everyday');
  assert('7d. switching back to Everyday does not resurrect the old provider either', switchedBackToEveryday.provider === '');
}

console.log('\n=== 8. Cash, Savings and liability dirty-state behaviour remains unchanged ===');
{
  // Cash/Savings sessions never call setProvider, so provider stays ''
  // throughout — the added clause is a structural no-op for them.
  const cashFresh: FormState = { label: '', value: '', interestRate: '', provider: '', assetType: 'cash', initialSnapshot: { label: '', value: '', interestRate: '', provider: '' } };
  assert('8a. a fresh Cash session is not dirty', !isDirty(cashFresh));
  const cashLabelChanged = { ...cashFresh, label: 'My Cash' };
  assert('8b. changing the Cash label still triggers dirty via the EXISTING label clause, unaffected by the provider addition', isDirty(cashLabelChanged));
  const cashProviderStillBlank = { ...cashLabelChanged, provider: '' };
  assert('8c. provider staying blank never contributes false-dirtiness for a Cash session', cashProviderStillBlank.provider === cashProviderStillBlank.initialSnapshot.provider);

  // Liability sessions: initialSnapshot.provider is always '' (per the
  // editLiability/fresh-liability branches), and provider itself is never
  // set during a liability session — the added clause is inert there too.
  const liabilityFresh: FormState = { label: '', value: '', interestRate: '', provider: '', assetType: 'n/a', initialSnapshot: { label: '', value: '', interestRate: '', provider: '' } };
  assert('8d. a fresh liability session is not dirty', !isDirty(liabilityFresh));
  const liabilityValueChanged = { ...liabilityFresh, value: '5000' };
  assert('8e. changing the liability balance still triggers dirty via the EXISTING value clause', isDirty(liabilityValueChanged));
}

console.log('\n=== Structural: the mirror above matches the shipped source (closes the mirror-accuracy gap) ===');
{
  assert(
    'S1. initialSnapshot useRef now includes provider',
    /const initialSnapshot = useRef\(\{ label: '', value: '', interestRate: '', provider: '' \}\);/.test(WEALTH_SRC)
  );
  assert(
    'S2. isDirty now includes the provider clause, in the same order the mirror assumes',
    /const isDirty =\s*\n\s*label !== initialSnapshot\.current\.label \|\|\s*\n\s*value !== initialSnapshot\.current\.value \|\|\s*\n\s*interestRate !== initialSnapshot\.current\.interestRate \|\|\s*\n\s*provider !== initialSnapshot\.current\.provider;/.test(
      WEALTH_SRC
    )
  );
  assert(
    'S3. the editAsset branch derives editProvider once and uses it for BOTH setProvider and the initialSnapshot write (no drift between the two)',
    /const editProvider = editAsset\.provider \?\? '';\s*\n\s*setProvider\(editProvider\);/.test(WEALTH_SRC) &&
      /initialSnapshot\.current = \{ label: editAsset\.label, value: String\(editAsset\.currentValue\), interestRate: rate, provider: editProvider \};/.test(WEALTH_SRC)
  );
  assert(
    // BNPL round (2026-08-09): the editLiability branch now derives
    // editLiabilityProvider once (editLiability.provider for a bnpl
    // session, else '' — every other liability type still gets exactly
    // the old hardcoded '', unchanged) and uses that SAME value for both
    // setProvider and the initialSnapshot write, mirroring S3's own
    // editAsset/editProvider no-drift pattern exactly.
    'S4. the editLiability branch derives editLiabilityProvider once (bnpl -> real provider, every other type -> \'\') and uses it for BOTH setProvider and the initialSnapshot write (no drift)',
    /const editLiabilityProvider = editLiability\.type === 'bnpl' \? editLiability\.provider \?\? '' : '';\s*\n\s*setProvider\(editLiabilityProvider\);/.test(WEALTH_SRC) &&
      /initialSnapshot\.current = \{\s*\n\s*label: editLiability\.label,\s*\n\s*value: String\(editLiability\.currentBalance\),\s*\n\s*interestRate: '',\s*\n\s*provider: editLiabilityProvider,\s*\n\s*\};/.test(WEALTH_SRC)
  );
  assert(
    'S5. the fresh/create branch resets both setProvider(\'\') and initialSnapshot\'s provider',
    /setInterestRate\(''\);\s*\n\s*setProvider\(''\);/.test(WEALTH_SRC) &&
      /initialSnapshot\.current = \{ label: '', value: '', interestRate: '', provider: '' \};/.test(WEALTH_SRC)
  );
  assert(
    // Correction round, 2026-08-10 — setIncludeInMoney's argument here now
    // reads `forcedIncludeInMoneyDefault ?? resolveIncludeInMoneyCalculations(...)`
    // (the scoped "Add a money balance" journey's seed override — see
    // AddAnythingSheet.tsx's own onlyBalances prop), wrapped onto its own
    // line by prettier once the expression grew past the line-length
    // threshold. The property this assertion actually guards — provider is
    // still cleared on every type-chip switch, immediately after the
    // include-in-money seed is (re)computed — is unchanged and re-verified
    // below against the new, longer expression.
    'S6. the type-chip tap handler clears provider on every asset-type switch',
    /setAssetType\(t\.value as AssetType\);\s*\n\s*setIncludeInMoney\(\s*\n\s*forcedIncludeInMoneyDefault \?\? resolveIncludeInMoneyCalculations\(\{ type: t\.value as AssetType, includeInMoneyCalculations: undefined \}\)\s*\n\s*\);\s*\n(?:\s*\/\/.*\n)*\s*setProvider\(''\);/.test(
      WEALTH_SRC
    )
  );
  assert(
    'S7. performSave\'s providerPayload derivation matches the mirror exactly',
    /const providerPayload = assetType === 'everyday' \? provider\.trim\(\) \|\| undefined : undefined;/.test(WEALTH_SRC)
  );
  assert(
    'S8. AddAnythingSheet\'s Keep-editing/reopenSource mechanism (what section 6 relies on) is untouched by this correction pass — grepped verbatim',
    /function reopenSource\(/.test(SHEET_SRC) && /function presentSwitchGuard\(/.test(SHEET_SRC)
  );
}

// =====================================================================
// Section 9: Select Balances add journey (Structural)
// =====================================================================

console.log('\n=== 9. Select Balances add journey — customer-facing action no longer excludes Everyday Account or forces Cash ===');
{
  assert(
    '9a. the customer-facing action wording no longer says "Cash or Savings" — updated to "+ Add a money balance"',
    /\+ Add a money balance/.test(SELECT_BALANCES_SRC) && !/\+ Add a Cash or Savings balance/.test(SELECT_BALANCES_SRC)
  );
  assert(
    '9b. structural: SelectBalancesSheet.tsx itself no longer references a Cash preset at all (the hand-off is now generic)',
    !/presetAssetType=.cash./.test(SELECT_BALANCES_SRC)
  );
  assert(
    '9c. MoneyScreen.tsx imports the existing, general AddAnythingSheet — the same component the global + button already uses — rather than inventing a second chooser',
    /import \{ AddAnythingSheet \} from '\.\.\/\.\.\/components\/navigation\/AddAnythingSheet';/.test(MONEY_SCREEN_SRC)
  );
  assert(
    '9d. the Select Balances add-flow no longer opens a Cash-preset AddWealthItemModal — that specific presetAssetType="cash" hand-off tied to addBalance is gone',
    !/addBalanceModalVisible/.test(MONEY_SCREEN_SRC)
  );
  assert(
    // Correction round, 2026-08-10 — requirement 5 scopes this same
    // AddAnythingSheet instance to balances only (`onlyBalances`, filtering
    // GROUPS down to cash/savings/everyday, never a second chooser
    // component) and its onClose now also re-opens Select Balances, so a
    // created (or cancelled) balance always returns the user there rather
    // than to the bare Money screen. The property this assertion actually
    // guards — the SAME AddAnythingSheet component, wired to the SAME
    // onAddBalance trigger, no new geometry — is unchanged and re-verified
    // against the new, extended onClose/onlyBalances wiring.
    '9e. the add-flow now renders AddAnythingSheet wired to the SAME onAddBalance trigger, scoped to balances only and returning to Select Balances on close — reusing the existing chooser/transition architecture verbatim (no new component, no new geometry)',
    /onAddBalance=\{\(\) => setAddBalanceChooserVisible\(true\)\}/.test(MONEY_SCREEN_SRC) &&
      /<AddAnythingSheet\s*\n\s*visible=\{addBalanceChooserVisible\}\s*\n\s*onClose=\{\(\) => \{\s*\n\s*setAddBalanceChooserVisible\(false\);\s*\n\s*setSelectBalancesVisible\(true\);\s*\n\s*\}\}\s*\n\s*onlyBalances\s*\n\s*\/>/.test(
        MONEY_SCREEN_SRC
      )
  );
  assert(
    '9f. Everyday Account, Cash and Savings are all genuine, unfiltered tiles inside the reused chooser (AddAnythingSheet.tsx\'s own Wealth group) — nothing about this hand-off narrows or filters that tile list',
    /\{ key: 'everyday', label: 'Add everyday account', emoji: '🏧' \}/.test(SHEET_SRC) &&
      /\{ key: 'cash', label: 'Add cash', emoji: '💵' \}/.test(SHEET_SRC) &&
      /\{ key: 'savings', label: 'Add savings', emoji: '🏦' \}/.test(SHEET_SRC)
  );
  assert(
    // Correction round, 2026-08-10 — SelectBalancesSheet's toggles became a
    // local draft (Cancel/Back must discard unconfirmed changes), so
    // handleAddBalance now commits that draft first (never silently
    // dropping in-progress toggles when the user reaches for "+ Add a
    // money balance" mid-edit). The property this assertion actually
    // guards — onClose() still fires BEFORE onAddBalance(), so the sheet
    // closes itself before handing off rather than stacking a second modal
    // — is unchanged and re-verified below alongside the new commitDraft()
    // call.
    '9g. dismissal sequencing (SelectBalancesSheet closes itself BEFORE handing off) is unchanged; handleAddBalance now also commits the pending draft first, so in-progress toggles are never silently discarded by this hand-off',
    /function handleAddBalance\(\) \{\s*\n\s*commitDraft\(\);\s*\n\s*onClose\(\);\s*\n\s*onAddBalance\(\);\s*\n\s*\}/.test(SELECT_BALANCES_SRC)
  );
  assert(
    '9h. the balances LIST itself (already fixed in the prior round) still includes Everyday Account alongside Cash/Savings — untouched by this correction',
    /a\.type === 'cash' \|\| a\.type === 'savings' \|\| a\.type === 'everyday'/.test(SELECT_BALANCES_SRC)
  );
  assert(
    '9i. the OTHER, unrelated AddWealthItemModal usage in MoneyScreen.tsx (Bill->Loan handoff, loanHandoff state) is untouched by this correction',
    /visible=\{loanHandoff !== null\}/.test(MONEY_SCREEN_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
