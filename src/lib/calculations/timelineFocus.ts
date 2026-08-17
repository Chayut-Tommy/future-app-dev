/**
 * Worth Knowing correction round — MoneyTimelineCard's own INNER destination
 * target, deliberately a separate module from moneySectionFocus.ts (the same
 * reasoning that module's own doc comment gives for not extending
 * sectionFocus.ts: a different domain deserves its own types, even though it
 * reuses the identical measured/pending/requestId PATTERN).
 *
 * moneySectionFocus.ts answers "has Money's page scroll reached the 'What
 * happens next' HEADING yet" — that positions the page at the top of the
 * timeline, nothing more. Once "What happens next" exceeds a handful of
 * events it becomes its own independently-scrollable box
 * (MoneyTimelineCard.tsx's own SCROLL_BOX_HEIGHT); a device test found that
 * reaching the heading is not the same as reaching the specific date group
 * an insight (WK-01's cluster, WK-02's single payment) is actually about —
 * the customer still had to scroll for several seconds inside that inner box
 * to find it. This module answers the narrower question: "given the inner
 * box's own measured date-group contents, can THIS specific target be
 * resolved right now."
 *
 * Same measured/pending/requestId contract as moneySectionFocus.ts: a
 * target that can't yet be resolved stays pending (retried as more groups
 * report layout, no frame budget, no timeout) rather than being abandoned.
 * The one genuinely new case this domain needs that the outer module
 * doesn't: a target that will NEVER resolve (its date simply isn't in the
 * currently rendered list, or its date exists but its own event(s) have
 * since been removed — e.g. the underlying data changed between when the
 * insight was computed and when the customer tapped it) must still give up
 * safely rather than staying pending forever, because there's no external
 * signal (like a fresh route param) that would otherwise clear it. "Give up
 * safely" here costs nothing extra — the outer page scroll has already
 * positioned the customer at the heading by the time this module is ever
 * consulted, so a target that can't be found simply leaves them there,
 * exactly the required fallback.
 *
 * Correction round §2 — a matching dateKey alone is NOT sufficient to trust
 * a target. A device test found a date group can genuinely contain events
 * that have nothing to do with the selected insight (e.g. an unrelated
 * salary sharing a due date with the target repayment) — scrolling there is
 * still correct (the group DOES contain the real target), but this module
 * must not conflate "a group exists at this date" with "the group still
 * contains the actual occurrence(s) the insight was computed from." A
 * target is trusted only when its own dateKey resolves to a rendered group
 * AND at least one of its occurrenceKeys is actually among that group's own
 * rendered occurrences — otherwise the date coincidentally still has
 * *something* there, but not the thing being described, and this gives up
 * safely rather than scrolling to (or, in a prior version of this file,
 * visually identifying) unrelated events.
 */

export interface TimelineFocusTarget {
  /** The same requestId the outer moneySectionFocus request already
   * carries (TodayScreen.tsx's own focusRequestIdRef) — reused, not a
   * second independent counter, so a repeat tap on the same insight is
   * still a genuine, detectable change here too. */
  requestId: number;
  /** Local-calendar date key (todayBriefing.ts's occurrenceDateKey format)
   * identifying which of MoneyTimelineCard's own day-groups to land on. */
  dateKey: string;
  /** The occurrence identities the source WorthKnowingInsight's own count/
   * total were computed from. At least one of these must still be present
   * among the target date group's own rendered occurrences for the target
   * to be trusted — see this file's own header comment. */
  occurrenceKeys: string[];
}

/** A single rendered date-group's own measured position and the occurrence
 * identities of every event actually rendered inside it — both needed to
 * validate a target, not just locate it. */
export interface TimelineGroupInfo {
  y: number;
  occurrenceKeys: string[];
}

export interface TimelineGroupOffsets {
  /** dateKey -> the group's own info, or absent if that group hasn't
   * reported layout yet. */
  groups: Map<string, TimelineGroupInfo>;
  /** How many date-groups are currently rendered — once every one of them
   * has reported and the target's date still isn't among them, it
   * genuinely doesn't exist in the current list; give up rather than stay
   * pending forever. */
  totalGroups: number;
}

export interface TimelineFocusFulfillment {
  /** True once this exact request (by requestId) has been resolved, one way
   * or the other — either a real, validated scroll target was found, or the
   * caller has exhausted every currently-rendered group (or found the date
   * but not a matching occurrence) without validating it. A caller must not
   * re-attempt a request once handled is true for its requestId, and must
   * not treat handled:false as failure — it means "keep waiting," not "give
   * up." */
  handled: boolean;
  /** The exact y to scroll the inner box to, or null when there is nothing
   * to scroll (still pending, date not found, or date found but no
   * occurrence match). */
  scrollY: number | null;
}

const PENDING: TimelineFocusFulfillment = { handled: false, scrollY: null };
const GIVE_UP: TimelineFocusFulfillment = { handled: true, scrollY: null };

export function computeTimelineFocusFulfillment(
  target: TimelineFocusTarget | null,
  lastHandledRequestId: number | null,
  data: TimelineGroupOffsets
): TimelineFocusFulfillment {
  if (!target) return PENDING;
  // Already resolved this exact request — never re-fire for the same tap
  // just because a later, unrelated group reports layout, an edit sheet
  // opens/closes, or the customer scrolls.
  if (target.requestId === lastHandledRequestId) return PENDING;

  const group = data.groups.get(target.dateKey);
  if (group === undefined) {
    if (data.groups.size >= data.totalGroups) {
      // Every currently-rendered group has reported layout and none matched
      // the target's date — it genuinely isn't in the rendered list. Give
      // up safely: the customer is already at the "What happens next"
      // heading via the independent outer section-focus mechanism.
      return GIVE_UP;
    }
    return PENDING; // still pending — retried as more groups report layout
  }

  // The date group exists — but a shared due date is not proof this is the
  // actual target. Require at least one genuine occurrence match before
  // trusting it (see this file's own header comment for the confirmed
  // device-test scenario this guards against).
  const hasMatchingOccurrence = target.occurrenceKeys.length > 0 && target.occurrenceKeys.some((k) => group.occurrenceKeys.includes(k));
  if (!hasMatchingOccurrence) return GIVE_UP; // stale — the date coincidentally still has a group, but not the target occurrence(s)

  return { handled: true, scrollY: group.y };
}
