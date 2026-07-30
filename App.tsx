import 'react-native-gesture-handler';
import './src/i18n';
import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { AppStateProvider, useAppState } from './src/state/AppStateContext';
import { CelebrationProvider } from './src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from './src/state/SavingsAllocationPromptContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import i18n, { resolveDeviceLanguage } from './src/i18n';
import { UnsavedChangesBanner } from './src/components/shared/UnsavedChangesBanner';
import { ResetPendingOverlay } from './src/components/shared/ResetPendingOverlay';

function AppShell() {
  const { colors, scheme } = useTheme();
  const { data, persistenceState, retryPersist } = useAppState();

  // Single source of truth for language is data.user.language — this effect
  // is what actually flips i18next's active locale whenever it changes
  // (including 'system', resolved against the device locale each time).
  useEffect(() => {
    const lang = data.user.language && data.user.language !== 'system' ? data.user.language : resolveDeviceLanguage();
    if (i18n.language !== lang) i18n.changeLanguage(lang);
  }, [data.user.language]);

  const navigationTheme = useMemo(
    () => ({
      dark: scheme === 'dark',
      colors: {
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.danger,
      },
      fonts: DefaultTheme.fonts,
    }),
    [colors, scheme]
  );

  // B2.0C — rendered here, not from any screen, so both surfaces survive
  // whatever navigation/modal state is active underneath (regression-
  // protection review, B2.0C corrected design §3/§4, mandatory correction
  // 1). Mutually exclusive by construction: an unresolved reset always
  // takes priority over the ordinary banner, since resetState !== 'none'
  // already implies status is 'saving' or 'error' for that same write.
  return (
    <NavigationContainer theme={navigationTheme}>
      <RootNavigator />
      {persistenceState.resetState !== 'none' ? (
        <ResetPendingOverlay resetState={persistenceState.resetState} onRetry={retryPersist} />
      ) : persistenceState.status === 'error' ? (
        <UnsavedChangesBanner onRetry={retryPersist} />
      ) : null}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <AppShell />
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
