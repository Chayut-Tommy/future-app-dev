import 'react-native-gesture-handler';
import './src/i18n';
import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { AppStateProvider, useAppState } from './src/state/AppStateContext';
import { CelebrationProvider } from './src/state/CelebrationContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import i18n, { resolveDeviceLanguage } from './src/i18n';

function AppShell() {
  const { colors, scheme } = useTheme();
  const { data } = useAppState();

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

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootNavigator />
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
            <AppShell />
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
