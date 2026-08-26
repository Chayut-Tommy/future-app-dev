import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MOTION_MS, MOTION_TRAVEL_PT, TOAST_LIFE_MILESTONE_MS, TOAST_LIFE_PLAIN_MS, resolveDuration } from '../../theme/motion';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { CelebrationEvent } from '../../lib/celebrations';

// Wave 10 — the approved structured dwell pair now lives with every other
// named motion constant in theme/motion.ts; re-exported so the existing
// evidence keeps one import site. Values and behaviour are byte-identical.
export const PLAIN_VISIBLE_MS = TOAST_LIFE_PLAIN_MS;
export const MILESTONE_VISIBLE_MS = TOAST_LIFE_MILESTONE_MS;

/**
 * The lightest celebration tier — premium visual elevation of the
 * functionally-approved Phase B toast. PRESENTATION ONLY: the single FIFO
 * queue, one-visible-at-a-time, per-event keyed remount, state-driven
 * lifetime/advance timers, idempotent dismissal, unmount cleanup, the
 * dead-world guard, event identity/tier/seen-state and every piece of
 * approved copy are exactly the approved implementation.
 *
 * VISUAL ROOT CAUSE this pass corrects: the card was predominantly white
 * (one 0.5-opacity wash over `bgSurface`) and blended into the checklist
 * beneath it; the 44pt tile read small; MILESTONE was faint free text; the
 * title used the body role; every event carried identical intensity.
 *
 * THE ELEVATION, all from existing semantic tokens (no raw colour):
 * - the card's own surface is now a full-strength pastel gradient —
 *   `interactiveTint` at the icon side → `bgSurface` through the centre →
 *   the theme's `ambient[0]` at the far edge — inside a clipped layer, so
 *   Ocean/Purple/Sunrise each visibly own it in light and dark;
 * - a thin `featured` top accent edge reveals once with the card, and the
 *   border is the style-scoped `heroBorder` (the token built for tinted
 *   hero surfaces);
 * - a soft ambient bloom (featured → interactiveTint, low opacity) sits
 *   clipped behind the leading icon and fades in with the entrance;
 * - the icon anchor is a 48pt MEDALLION: a tinted halo around an elevated
 *   inner tile holding the structured event icon, with a subtle 0.94→1
 *   scale+opacity reveal tied to the existing entrance value — removed
 *   under Reduced Motion, never looping, pulsing or spinning;
 * - `context: 'MILESTONE'` renders as a tinted capsule with a small
 *   sparkle glyph (structured field only — never derived from copy);
 *   events without context render no capsule and no spacer;
 * - the title steps up to the `titleCard` role with tabular numerals (so
 *   "$1,000" and "80+" set correctly); support copy keeps its quieter
 *   role; nothing truncates — 320pt + 200% Dynamic Type grow vertically;
 * - the quiet 44pt Dismiss sits consistently top-right; only it
 *   intercepts touches (the `box-none` chain is preserved);
 * - this renderer is haptically SILENT (Wave 10 closure): the action's
 *   single shared softSuccess is dispatched once at the celebration
 *   queue's own enqueue boundary, so a save that queues several events
 *   can never vibrate more than once;
 * - decorative layers (gradient, bloom, accent, halo, glyphs) are hidden
 *   from accessibility; context, title and support are announced exactly
 *   once per event with focus never stolen.
 */
export function SmallCelebrationToast({ event, onDone }: { event: CelebrationEvent; onDone: () => void }) {
  const { semantic, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  /** Exit exactly once: play the short exit fade (presentation only) and
   * advance the queue on its own state timer — never from the animation's
   * completion callback (motion hard rule 5). */
  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    // Harness resilience: several long-standing rendered suites never
    // unmount their roots, so under jest's per-file teardown this state
    // timer can fire after the module registry is gone — where `Animated`
    // resolves to undefined and the previous implementation's
    // Animated-internal timers failed silently. A dead world gets a
    // no-op, never a crash into whichever suite runs next; in the app
    // this guard is unreachable.
    if (!Animated || !Animated.timing) return;
    const outMs = resolveDuration('toastOut', reduceMotionRef.current);
    Animated.timing(progress, { toValue: 0, duration: outMs, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    exitTimerRef.current = setTimeout(onDone, outMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone, progress]);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  // ONE announcement per event — on mount, never gated on the animation,
  // never moving VoiceOver focus. The structured context is spoken once,
  // ahead of the title.
  useEffect(() => {
    // Wave 10 closure — this renderer is haptically SILENT. Each queued
    // event gets its own keyed mount, so a per-mount dispatch fired once
    // PER EVENT (two haptics from one save that unlocked two milestones —
    // the confirmed defect). The action's single shared softSuccess now
    // lives at CelebrationContext's enqueue boundary.
    const spoken = [event.context, event.title, event.body].filter(Boolean).join('. ');
    AccessibilityInfo.announceForAccessibility(spoken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  // Enter — presentation only. Re-resolves if the RM preference lands
  // after mount; the conservative pre-resolution default simply fades.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: resolveDuration('toastIn', reduceMotion),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  // Unmount cleanup: a queued exit-advance can never fire into an
  // unmounted provider (and can never leak across test files).
  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    []
  );

  // The lifetime is a state timer keyed on the EVENT — a parent rerender
  // never resets it, and it fires whether or not any animation ran. The
  // hold is structured: a milestone context earns the longer read.
  useEffect(() => {
    const holdMs = event.context ? MILESTONE_VISIBLE_MS : PLAIN_VISIBLE_MS;
    const timer = setTimeout(() => dismissRef.current(), MOTION_MS.toastIn + holdMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: 'absolute',
          left: designLayout.screenMargin,
          right: designLayout.screenMargin,
          top: insets.top + designSpacing.sm,
          zIndex: 50,
        },
        card: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.hero,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
          ...cardShadow,
        },
        // The decorative layer, clipped to the card radius — the shadow
        // stays on the card above, so clipping cannot flatten it.
        clip: { ...StyleSheet.absoluteFillObject, borderRadius: designRadius.hero, overflow: 'hidden' },
        bloom: {
          position: 'absolute',
          top: -designSpacing.xl,
          left: -designSpacing.xl,
          width: 120,
          height: 120,
          borderRadius: 60,
        },
        topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: designSpacing.md,
          paddingVertical: designSpacing.md,
          paddingLeft: designLayout.cardPadding,
          paddingRight: 44 + designSpacing.xs,
        },
        medallion: {
          width: 48,
          height: 48,
          borderRadius: designRadius.card,
          backgroundColor: semantic.interactiveTint,
          alignItems: 'center',
          justifyContent: 'center',
        },
        medallionInner: {
          width: 36,
          height: 36,
          borderRadius: designRadius.tile,
          backgroundColor: semantic.bgSurface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.heroBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textBlock: { flex: 1, paddingTop: 2 },
        contextCapsule: {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: designSpacing.xs,
          backgroundColor: semantic.interactiveTint,
          borderRadius: designRadius.pill,
          paddingHorizontal: designSpacing.sm,
          paddingVertical: 2,
          marginBottom: designSpacing.xs,
        },
        contextText: { ...typeStyle('eyebrow', locale), color: semantic.interactive },
        title: { ...typeStyle('titleCard', locale), color: semantic.textPrimary, fontVariant: ['tabular-nums'] },
        body: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: 2 },
        dismiss: {
          position: 'absolute',
          top: 0,
          right: 0,
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [semantic, cardShadow, insets.top, locale]
  );

  const medallionScale = reduceMotion ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: progress,
            transform: [
              {
                translateY: reduceMotion
                  ? 0
                  : progress.interpolate({ inputRange: [0, 1], outputRange: [-MOTION_TRAVEL_PT.toastRise, 0] }),
              },
            ],
          },
        ]}
        pointerEvents="box-none"
        testID="celebration-toast"
      >
        <View style={styles.clip} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* The card's OWN surface: interactive tint at the icon side,
              through bgSurface, into the theme's ambient at the far edge —
              full-strength pastel stops, visibly the selected style. */}
          <LinearGradient
            colors={[semantic.interactiveTint, semantic.bgSurface, semantic.ambient[0]] as const}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {/* The soft ambient bloom behind the medallion, revealed with
              the entrance — one fade, no loop. */}
          <Animated.View style={[styles.bloom, { opacity: Animated.multiply(progress, 0.3) }]}>
            <LinearGradient
              colors={[semantic.featured[0], semantic.interactiveTint] as const}
              start={{ x: 0.2, y: 0.2 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 60 }]}
            />
          </Animated.View>
          {/* The thin theme accent edge, revealed once with the card. */}
          <View style={styles.topAccent}>
            <LinearGradient
              colors={[semantic.featured[0], semantic.featured[1]] as const}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
        <View style={styles.row} pointerEvents="box-none">
          <Animated.View
            style={[styles.medallion, { transform: [{ scale: medallionScale }] }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.medallionInner}>
              <Ionicons name={event.icon} size={20} color={semantic.interactive} />
            </View>
          </Animated.View>
          <View style={styles.textBlock} pointerEvents="none">
            {event.context ? (
              <View style={styles.contextCapsule}>
                <Ionicons name="sparkles" size={10} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                <Text style={styles.contextText}>{event.context}</Text>
              </View>
            ) : null}
            <Text style={styles.title}>{event.title}</Text>
            {event.body ? <Text style={styles.body}>{event.body}</Text> : null}
          </View>
        </View>
        <TouchableOpacity
          style={styles.dismiss}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          testID="celebration-toast-dismiss"
        >
          <Ionicons name="close" size={14} color={semantic.textTertiary} accessibilityElementsHidden importantForAccessibility="no" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
