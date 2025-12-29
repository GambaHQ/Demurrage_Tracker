// Main App Component for Demurrage Tracker
import React, { useEffect } from 'react';
import { StyleSheet, View, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme, ActivityIndicator, Text } from 'react-native-paper';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppStore } from './src/store/appStore';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

// Custom theme
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2196F3',
    secondary: '#FF9800',
    tertiary: '#4CAF50',
    error: '#f44336',
    background: '#f5f5f5',
    surface: '#ffffff',
    surfaceVariant: '#e3f2fd',
  },
};

function AppContent() {
  const { 
    isInitialized, 
    isLoading, 
    error, 
    authStatus,
    initialize,
  } = useAppStore();

  useEffect(() => {
    initialize();
  }, []);

  // Show loading screen while initializing
  if (isLoading && !isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Initializing Demurrage Tracker...</Text>
      </View>
    );
  }

  // Show error screen if initialization failed
  if (error && !isInitialized) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const isAuthenticated = authStatus === 'authenticated';

  return <AppNavigator isAuthenticated={isAuthenticated} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style="light" />
        <AppContent />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f44336',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
