import React, { useCallback, useRef } from 'react';
import { ScrollView } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Pass D.1 — the BODY of the timeline's event detail (everything under its pinned
 * heading and Close control).
 *
 * The detail sits in normal page flow below the rail. A grouped marker, or a large
 * text size, can make it taller than the part of the screen that is clear of the
 * floating dock. Its height is therefore bounded by `maxHeight` (derived by the host
 * from the shared dock/safe-area geometry) and, only when the rows do not fit, they
 * scroll INSIDE the card. Nothing is clipped, shrunk or hidden.
 *
 * When the rows fit, this is an inert container: it sizes to its content, never
 * bounces and never takes the page's scroll gesture.
 */
export function TimelineDetailBody({ maxHeight, children, testID }: { maxHeight?: number; children: React.ReactNode; testID?: string }) {
  const ref = useRef<ScrollView | null>(null);
  const frame = useRef(0);
  const content = useRef(0);
  const flashed = useRef(false);

  // The system scroll indicator is the cue that more rows exist below the fold.
  const cue = useCallback(() => {
    if (flashed.current || frame.current <= 0 || content.current <= frame.current + 1) return;
    flashed.current = true;
    ref.current?.flashScrollIndicators?.();
  }, []);

  return (
    <ScrollView
      ref={ref}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
      onLayout={(e: LayoutChangeEvent) => {
        frame.current = e.nativeEvent.layout.height;
        cue();
      }}
      onContentSizeChange={(_w: number, h: number) => {
        content.current = h;
        cue();
      }}
      nestedScrollEnabled
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      showsVerticalScrollIndicator
      persistentScrollbar
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
