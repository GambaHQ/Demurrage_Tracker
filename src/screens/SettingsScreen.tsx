// Settings screen - Configure app settings and security
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Card,
  Title,
  Text,
  TextInput,
  Button,
  Switch,
  List,
  Divider,
  useTheme,
  Dialog,
  Portal,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { AppSettings, UserRole } from '../types';
import * as api from '../services/api';
import {
  isBiometricSupported,
  getBiometricTypeName,
  setupPIN,
  isPINEnabled,
  isBiometricEnabled,
  setBiometricEnabled,
  removePIN,
} from '../services/auth';
import { sendTestEmail } from '../services/email';
import { clearAllTrackingData } from '../services/database';

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, saveSettings, loadSettings, refreshAllData, userRole, setUserRole, user, company, logout: storeLogout } = useAppStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [localSettings, setLocalSettings] = useState<AppSettings>({
    recipientEmail: '',
    demurrageThresholdMinutes: 1, // Changed to 1 min for testing (default: 50)
    autoSendInvoice: true,
    trackingEnabled: true,
    biometricEnabled: false,
    hourlyRate: 0,
    companyName: '',
    companyAddress: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricName, setBiometricName] = useState('Biometric');
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
    checkSecurityStatus();
  }, [settings]);

  const checkSecurityStatus = async () => {
    const biometric = await isBiometricSupported();
    setBiometricAvailable(biometric);

    if (biometric) {
      const name = await getBiometricTypeName();
      setBiometricName(name);
    }

    const pinStatus = await isPINEnabled();
    setPinEnabled(pinStatus);

    const bioEnabled = await isBiometricEnabled();
    setLocalSettings((prev) => ({ ...prev, biometricEnabled: bioEnabled }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(localSettings);
      Alert.alert('Success', 'Settings saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
    setIsSaving(false);
  };

  const handleTestEmail = async () => {
    if (!localSettings.recipientEmail) {
      Alert.alert('Error', 'Please enter a recipient email first');
      return;
    }

    const result = await sendTestEmail(localSettings.recipientEmail);
    if (result.success) {
      Alert.alert('Success', 'Test email composed. Please send it from your email app.');
    } else {
      Alert.alert('Error', result.error || 'Failed to send test email');
    }
  };

  const handleSetupPIN = async () => {
    if (pin.length < 4 || pin.length > 8) {
      Alert.alert('Error', 'PIN must be 4-8 digits');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }

    const success = await setupPIN(pin);
    if (success) {
      setPinEnabled(true);
      setShowPinDialog(false);
      setPin('');
      setConfirmPin('');
      Alert.alert('Success', 'PIN set up successfully');
    } else {
      Alert.alert('Error', 'Failed to set up PIN');
    }
  };

  const handleRemovePIN = async () => {
    Alert.alert(
      'Remove PIN',
      'Are you sure you want to remove PIN protection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removePIN();
            if (success) {
              setPinEnabled(false);
              setLocalSettings((prev) => ({ ...prev, biometricEnabled: false }));
              Alert.alert('Success', 'PIN removed');
            }
          },
        },
      ]
    );
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    if (enabled && !pinEnabled) {
      Alert.alert('Error', 'Please set up a PIN first');
      return;
    }

    const success = await setBiometricEnabled(enabled);
    if (success) {
      setLocalSettings((prev) => ({ ...prev, biometricEnabled: enabled }));
    }
  };

  const handleClearData = async () => {
    Alert.alert(
      'Clear All Tracking Data',
      'This will delete all stop events, demurrage records, and invoices. Your settings will be kept. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearAllTrackingData();
              await refreshAllData();
              Alert.alert('Success', 'All tracking data has been cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
            setIsClearing(false);
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await api.logout();
              storeLogout();
            } catch (error) {
              console.error('Logout error:', error);
              storeLogout();
            }
            setIsLoggingOut(false);
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* User Info Card */}
      {user && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.userHeader}>
              <MaterialCommunityIcons name="account-circle" size={48} color={theme.colors.primary} />
              <View style={styles.userInfo}>
                <Title>{user.firstName} {user.lastName}</Title>
                <Text style={styles.userEmail}>{user.email}</Text>
                <Text style={styles.userRole}>{user.role.toUpperCase()} {company ? `at ${company.name}` : ''}</Text>
              </View>
            </View>
            <Button
              mode="outlined"
              onPress={handleLogout}
              loading={isLoggingOut}
              disabled={isLoggingOut}
              style={styles.logoutButton}
              icon="logout"
              textColor="#f44336"
            >
              Logout
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Email Settings */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Email Settings</Title>
          <TextInput
            label="Recipient Email"
            value={localSettings.recipientEmail}
            onChangeText={(text) =>
              setLocalSettings((prev) => ({ ...prev, recipientEmail: text }))
            }
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            left={<TextInput.Icon icon="email" />}
          />
          <Button
            mode="outlined"
            onPress={handleTestEmail}
            style={styles.testButton}
            icon="email-send"
          >
            Send Test Email
          </Button>

          <List.Item
            title="Auto-send Weekly Invoice"
            description="Automatically send invoice on Sunday"
            left={(props) => <List.Icon {...props} icon="calendar-clock" />}
            right={() => (
              <Switch
                value={localSettings.autoSendInvoice}
                onValueChange={(value) =>
                  setLocalSettings((prev) => ({ ...prev, autoSendInvoice: value }))
                }
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* Demurrage Settings */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Demurrage Settings</Title>
          <TextInput
            label="Demurrage Threshold (minutes)"
            value={String(localSettings.demurrageThresholdMinutes)}
            onChangeText={(text) =>
              setLocalSettings((prev) => ({
                ...prev,
                demurrageThresholdMinutes: parseInt(text) || 50,
              }))
            }
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Icon icon="clock-alert" />}
          />
          <Text style={styles.helperText}>
            Stops longer than this will count as demurrage
          </Text>

          <TextInput
            label="Hourly Rate ($) - Optional"
            value={String(localSettings.hourlyRate || '')}
            onChangeText={(text) =>
              setLocalSettings((prev) => ({
                ...prev,
                hourlyRate: parseFloat(text) || 0,
              }))
            }
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            left={<TextInput.Icon icon="currency-usd" />}
          />
          <Text style={styles.helperText}>
            Set hourly rate to include billing amount on invoices
          </Text>
        </Card.Content>
      </Card>

      {/* Company Info */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Company Information</Title>
          <TextInput
            label="Company Name"
            value={localSettings.companyName || ''}
            onChangeText={(text) =>
              setLocalSettings((prev) => ({ ...prev, companyName: text }))
            }
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="domain" />}
          />
          <TextInput
            label="Company Address"
            value={localSettings.companyAddress || ''}
            onChangeText={(text) =>
              setLocalSettings((prev) => ({ ...prev, companyAddress: text }))
            }
            mode="outlined"
            multiline
            numberOfLines={2}
            style={styles.input}
            left={<TextInput.Icon icon="map-marker" />}
          />
        </Card.Content>
      </Card>

      {/* Security Settings */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Security</Title>
          <List.Item
            title="PIN Protection"
            description={pinEnabled ? 'PIN is enabled' : 'Set up a PIN to protect the app'}
            left={(props) => <List.Icon {...props} icon="lock" />}
            right={() =>
              pinEnabled ? (
                <Button mode="text" onPress={handleRemovePIN}>
                  Remove
                </Button>
              ) : (
                <Button mode="text" onPress={() => setShowPinDialog(true)}>
                  Set Up
                </Button>
              )
            }
          />

          {biometricAvailable && (
            <List.Item
              title={`${biometricName} Authentication`}
              description={`Use ${biometricName} to unlock the app`}
              left={(props) => <List.Icon {...props} icon="fingerprint" />}
              right={() => (
                <Switch
                  value={localSettings.biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={!pinEnabled}
                />
              )}
            />
          )}

          <View style={styles.securityNote}>
            <MaterialCommunityIcons name="shield-check" size={20} color="#4CAF50" />
            <Text style={styles.securityNoteText}>
              All data is encrypted with AES-256 encryption
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Tracking Settings */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Tracking</Title>
          <List.Item
            title="Enable Tracking"
            description="Allow background location tracking"
            left={(props) => <List.Icon {...props} icon="crosshairs-gps" />}
            right={() => (
              <Switch
                value={localSettings.trackingEnabled}
                onValueChange={(value) =>
                  setLocalSettings((prev) => ({ ...prev, trackingEnabled: value }))
                }
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* User Mode */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>User Mode</Title>
          <List.Item
            title="Driver Mode"
            description="Simplified view with start/stop only"
            left={(props) => <List.Icon {...props} icon="truck" />}
            right={() => (
              <Switch
                value={userRole === 'driver'}
                onValueChange={(value) => setUserRole(value ? 'driver' : 'admin')}
              />
            )}
          />
          <Text style={styles.helperText}>
            {userRole === 'driver' 
              ? 'Switch off for full admin access with history and invoices'
              : 'Switch on for simplified driver view'}
          </Text>
        </Card.Content>
      </Card>

      {/* Save Button */}
      <Button
        mode="contained"
        onPress={handleSave}
        loading={isSaving}
        style={styles.saveButton}
        icon="content-save"
      >
        Save Settings
      </Button>

      {/* About */}
      <Card style={[styles.card, styles.lastCard]}>
        <Card.Content>
          <Title>About</Title>
          <List.Item
            title="Demurrage Tracker"
            description="Version 1.0.0"
            left={(props) => <List.Icon {...props} icon="information" />}
          />
          <Divider style={{ marginVertical: 12 }} />
          <Title style={{ color: '#f44336' }}>Danger Zone</Title>
          <Text style={styles.helperText}>
            Clear all tracking data to start fresh. Settings will be preserved.
          </Text>
          <Button
            mode="outlined"
            onPress={handleClearData}
            loading={isClearing}
            disabled={isClearing}
            style={styles.dangerButton}
            icon="delete-forever"
            textColor="#f44336"
          >
            Clear All Tracking Data
          </Button>
        </Card.Content>
      </Card>

      {/* PIN Setup Dialog */}
      <Portal>
        <Dialog visible={showPinDialog} onDismiss={() => setShowPinDialog(false)}>
          <Dialog.Title>Set Up PIN</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Enter PIN (4-8 digits)"
              value={pin}
              onChangeText={setPin}
              mode="outlined"
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
              style={styles.dialogInput}
            />
            <TextInput
              label="Confirm PIN"
              value={confirmPin}
              onChangeText={setConfirmPin}
              mode="outlined"
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowPinDialog(false)}>Cancel</Button>
            <Button onPress={handleSetupPIN}>Set PIN</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 12,
    marginBottom: 0,
  },
  lastCard: {
    marginBottom: 24,
  },
  input: {
    marginTop: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginLeft: 12,
  },
  testButton: {
    marginTop: 12,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#2e7d32',
  },
  saveButton: {
    margin: 12,
  },
  dialogInput: {
    marginBottom: 12,
  },
  dangerButton: {
    marginTop: 12,
    borderColor: '#f44336',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    color: '#666',
    fontSize: 14,
  },
  userRole: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    marginTop: 8,
    borderColor: '#f44336',
  },
});
