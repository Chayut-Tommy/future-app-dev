import { CelebrationEvent, buildDebtFreeCelebration } from './celebrations';
import { UserProfile } from '../types/models';

/**
 * Checklist consistency correction — the ONE no-debt confirmation
 * authority, shared verbatim by both entry points (the Debt Coach sheet's
 * "I don't have any debt" and the checklist's attached Debt footer): one
 * persisted acknowledgement write, the action's single canonical
 * save-feedback event, and the one accepted debt-free celebration. Neither
 * caller adds any feedback of its own, so the behaviour cannot drift or
 * double. Real recorded debt authoritatively clears the flag afterwards
 * (see supersedeSetupAcknowledgements), so deleting the final debt never
 * resurrects a stale declaration.
 */
export function confirmNoDebt(deps: {
  updateUser: (patch: Partial<UserProfile>) => void;
  confirmSaveSuccess: () => void;
  celebrate: (event: CelebrationEvent) => void;
}): void {
  deps.updateUser({ confirmedNoDebt: true });
  deps.confirmSaveSuccess();
  deps.celebrate(buildDebtFreeCelebration());
}
