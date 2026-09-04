// Pass C.1 correction — the timeframe chooser ↔ picker state machine, and the
// cents-aware money formatter. CLASSIFICATION: Real import (Class A). Proves
// the ONE-modal-at-a-time ordering deterministically, without a device.
//
// Run with: npx tsx tests/c1-timeframe-flow.test.ts

import { timeframeFlowTransition, timeframeSheetVisible, datePickerVisible, TimeframeStage } from '../src/lib/calculations/timeframeFlow';
import { formatDollarsCentsAware, formatCentsCentsAware } from '../src/lib/calculations/money';
import { resultRegionsStack } from '../src/lib/calculations/moneyComposition';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const t = timeframeFlowTransition;

console.log('=== iOS handshake: only one surface presented at a time ===');
{
  // open the chooser
  let s: TimeframeStage = t('idle', { type: 'open_chooser' });
  assert('open → chooser', s === 'chooser');
  assert('chooser: sheet visible, picker not', timeframeSheetVisible(s) && !datePickerVisible(s));

  // choose a date (iOS): chooser begins dismissing; NEITHER surface presented
  s = t(s, { type: 'choose_date', isIOS: true });
  assert('choose_date(iOS) → chooser_to_picker', s === 'chooser_to_picker');
  assert('hand-off: neither the sheet NOR the picker is presented', !timeframeSheetVisible(s) && !datePickerVisible(s));

  // picker presents ONLY after the chooser's native dismissal completes
  const early = t('chooser_to_picker', { type: 'picker_dismissed' }); // spurious event
  assert('a spurious picker_dismissed does not present the picker early', early === 'chooser_to_picker');
  s = t(s, { type: 'chooser_dismissed' });
  assert('chooser_dismissed → picker', s === 'picker');
  assert('picker: picker visible, sheet not', datePickerVisible(s) && !timeframeSheetVisible(s));

  // confirm closes to idle
  assert('close (confirm) → idle', t(s, { type: 'close' }) === 'idle');
}

console.log('=== iOS cancel returns to the chooser via the picker dismissal ===');
{
  let s: TimeframeStage = 'picker';
  s = t(s, { type: 'cancel_picker', isIOS: true });
  assert('cancel(iOS) → picker_to_chooser', s === 'picker_to_chooser');
  assert('hand-off: neither surface presented', !timeframeSheetVisible(s) && !datePickerVisible(s));
  const early = t('picker_to_chooser', { type: 'chooser_dismissed' }); // spurious
  assert('a spurious chooser_dismissed does not reopen the chooser early', early === 'picker_to_chooser');
  s = t(s, { type: 'picker_dismissed' });
  assert('picker_dismissed → chooser', s === 'chooser');
}

console.log('=== Android: picker is a dialog — no hand-off stage ===');
{
  assert('choose_date(Android) → picker directly', t('chooser', { type: 'choose_date', isIOS: false }) === 'picker');
  assert('cancel(Android) → chooser directly', t('picker', { type: 'cancel_picker', isIOS: false }) === 'chooser');
}

console.log('=== Robustness: events ignored off their valid stage; never stuck ===');
{
  assert('choose_date ignored when not in chooser', t('idle', { type: 'choose_date', isIOS: true }) === 'idle');
  assert('cancel_picker ignored when not in picker', t('chooser', { type: 'cancel_picker', isIOS: true }) === 'chooser');
  assert('chooser_dismissed on a plain chooser is a no-op (ordinary close)', t('chooser', { type: 'chooser_dismissed' }) === 'chooser');
  assert('close from any stage → idle', t('picker_to_chooser', { type: 'close' }) === 'idle');
  // No stage ever reports BOTH surfaces visible.
  const stages: TimeframeStage[] = ['idle', 'chooser', 'chooser_to_picker', 'picker', 'picker_to_chooser'];
  assert('no stage presents two surfaces at once', stages.every((st) => !(timeframeSheetVisible(st) && datePickerVisible(st))));
}

console.log('=== Cents-aware money formatter (one formatter, both modes) ===');
{
  assert('whole dollars show no cents', formatDollarsCentsAware(5118) === '$5,118');
  assert('never "$5,118.00"', formatDollarsCentsAware(5118.0) === '$5,118');
  assert('material cents are preserved', formatDollarsCentsAware(5118.42) === '$5,118.42');
  assert('float noise rounds to whole', formatDollarsCentsAware(5117.999999) === '$5,118');
  assert('negatives are signed', formatDollarsCentsAware(-180) === '-$180');
  assert('negative with cents', formatDollarsCentsAware(-180.5) === '-$180.50');
  assert('non-finite → $0', formatDollarsCentsAware(NaN) === '$0');
  assert('cents-native sibling: 530000 → $5,300', formatCentsCentsAware(530000) === '$5,300');
  assert('cents-native sibling: 405012 → $4,050.12', formatCentsCentsAware(405012) === '$4,050.12');
}

console.log('=== Two-region responsive stacking ===');
{
  assert('normal iPhone, default type → side by side', resultRegionsStack(390, 1.0) === false);
  assert('narrow width → stacked', resultRegionsStack(320, 1.0) === true);
  assert('accessibility text size → stacked', resultRegionsStack(390, 1.3) === true);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
