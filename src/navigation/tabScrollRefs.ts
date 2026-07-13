import { createRef, RefObject } from 'react';
import { ScrollView } from 'react-native';

/**
 * One ScrollView ref per top-level tab, shared between each screen (which
 * attaches it via `Screen`'s `scrollRef` prop) and `MainTabNavigator`
 * (which scrolls to top when the already-active tab is tapped again — PRD
 * ask: matches Instagram/Apple apps' standard behaviour).
 */
export const tabScrollRefs: Record<'Today' | 'Wealth' | 'Money' | 'Grow', RefObject<ScrollView | null>> = {
  Today: createRef<ScrollView>(),
  Wealth: createRef<ScrollView>(),
  Money: createRef<ScrollView>(),
  Grow: createRef<ScrollView>(),
};
