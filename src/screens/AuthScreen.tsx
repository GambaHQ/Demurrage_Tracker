// Authentication screen - Login and Registration with API
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Surface,
  useTheme,
  ActivityIndicator,
  SegmentedButtons,
  Divider,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import * as api from '../services/api';
import { clearAllLocalData } from '../services/database';

type AuthMode = 'login' | 'register' | 'invite' | 'forgot' | 'reset';

export default function AuthScreen() {
  const theme = useTheme();
  const { setAuthStatus, setUser, setCompany, initialize, isInitialized } = useAppStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [error, setError] = useState('');
  
  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [truckRego, setTruckRego] = useState('');
  const [trailerRego, setTrailerRego] = useState('');
  
  // Register fields
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [abn, setAbn] = useState('');
  const [phone, setPhone] = useState('');
  
  // Invite fields
  const [inviteToken, setInviteToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState<{email: string; companyName: string; role: string} | null>(null);
  
  // Password reset fields
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (!isInitialized) {
        await initialize();
      }
      
      // Check if already authenticated
      const authStatus = await api.checkAuthStatus();
      if (authStatus.isAuthenticated && authStatus.user) {
        setUser(authStatus.user);
        setAuthStatus('authenticated');
        return;
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Auth initialization error:', error);
      setError('Failed to initialize. Please check your connection.');
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      // Clear any cached local data from previous user before logging in
      await clearAllLocalData();
      
      const response = await api.login({
        email,
        password,
        truckRego: truckRego || undefined,
        trailerRego: trailerRego || undefined,
      });
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setCompany(response.data.company);
        setAuthStatus('authenticated');
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (error: any) {
      setError(error.message || 'Login failed');
    }
    
    setIsSubmitting(false);
  };

  const handleRegister = async () => {
    if (!companyName || !email || !password || !firstName || !lastName) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      // Clear any cached local data from previous user
      await clearAllLocalData();
      
      const response = await api.registerCompany({
        companyName,
        email,
        password,
        firstName,
        lastName,
        abn: abn || undefined,
        phone: phone || undefined,
      });
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setCompany(response.data.company);
        setAuthStatus('authenticated');
      } else {
        setError(response.error || 'Registration failed');
      }
    } catch (error: any) {
      setError(error.message || 'Registration failed');
    }
    
    setIsSubmitting(false);
  };

  const handleCheckInvite = async () => {
    if (!inviteToken) {
      setError('Please enter your invitation code');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await api.getInvitation(inviteToken);
      
      if (response.success && response.data) {
        setInviteInfo({
          email: response.data.email,
          companyName: response.data.companyName,
          role: response.data.role,
        });
        setEmail(response.data.email);
      } else {
        setError(response.error || 'Invalid invitation');
      }
    } catch (error: any) {
      setError(error.message || 'Invalid invitation');
    }
    
    setIsSubmitting(false);
  };

  const handleAcceptInvite = async () => {
    if (!password || !firstName || !lastName) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await api.acceptInvitation({
        token: inviteToken,
        password,
        firstName,
        lastName,
      });
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setAuthStatus('authenticated');
      } else {
        setError(response.error || 'Failed to accept invitation');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to accept invitation');
    }
    
    setIsSubmitting(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await api.forgotPassword(email);
      
      if (response.success) {
        // In development, the reset code is returned
        if (response.data?.resetCode) {
          setResetCode(response.data.resetCode);
        }
        setAuthMode('reset');
      } else {
        setError(response.error || 'Failed to send reset code');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to send reset code');
    }
    
    setIsSubmitting(false);
  };

  const handleResetPassword = async () => {
    if (!resetCode || !newPassword) {
      setError('Please enter the reset code and new password');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await api.resetPassword({
        email,
        token: resetCode,
        newPassword,
      });
      
      if (response.success) {
        setResetSuccess(true);
        // Clear fields
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setResetCode('');
      } else {
        setError(response.error || 'Failed to reset password');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to reset password');
    }
    
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.colors.primary }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.colors.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Surface style={styles.iconContainer} elevation={4}>
            <MaterialCommunityIcons name="truck-cargo-container" size={64} color={theme.colors.primary} />
          </Surface>
          <Text style={styles.title}>Demurrage Tracker</Text>
          <Text style={styles.subtitle}>Multi-Company Fleet Management</Text>
        </View>

        <Surface style={styles.authCard} elevation={4}>
          <SegmentedButtons
            value={authMode}
            onValueChange={(value) => {
              setAuthMode(value as AuthMode);
              setError('');
              setInviteInfo(null);
            }}
            buttons={[
              { value: 'login', label: 'Login' },
              { value: 'register', label: 'Register' },
              { value: 'invite', label: 'Invite' },
            ]}
            style={styles.segmentedButtons}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* LOGIN FORM */}
          {authMode === 'login' && (
            <>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
              />
              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
                left={<TextInput.Icon icon="lock" />}
              />
              
              <Divider style={styles.divider} />
              <Text style={styles.sectionLabel}>Vehicle Info (Optional)</Text>
              
              <TextInput
                label="Truck Rego"
                value={truckRego}
                onChangeText={(text) => setTruckRego(text.toUpperCase())}
                mode="outlined"
                autoCapitalize="characters"
                style={styles.input}
                left={<TextInput.Icon icon="truck" />}
              />
              <TextInput
                label="Trailer Rego"
                value={trailerRego}
                onChangeText={(text) => setTrailerRego(text.toUpperCase())}
                mode="outlined"
                autoCapitalize="characters"
                style={styles.input}
                left={<TextInput.Icon icon="truck-trailer" />}
              />
              
              <Button
                mode="contained"
                onPress={handleLogin}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
                icon="login"
              >
                Sign In
              </Button>
              
              <Button
                mode="text"
                onPress={() => {
                  setAuthMode('forgot');
                  setError('');
                }}
                style={styles.forgotButton}
              >
                Forgot Password?
              </Button>
            </>
          )}

          {/* REGISTER FORM */}
          {authMode === 'register' && (
            <>
              <Text style={styles.sectionLabel}>Company Details</Text>
              <TextInput
                label="Company Name *"
                value={companyName}
                onChangeText={setCompanyName}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="domain" />}
              />
              <TextInput
                label="ABN (Optional)"
                value={abn}
                onChangeText={setAbn}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
                left={<TextInput.Icon icon="card-account-details" />}
              />
              <TextInput
                label="Phone (Optional)"
                value={phone}
                onChangeText={setPhone}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
                left={<TextInput.Icon icon="phone" />}
              />
              
              <Divider style={styles.divider} />
              <Text style={styles.sectionLabel}>Admin Account</Text>
              
              <View style={styles.row}>
                <TextInput
                  label="First Name *"
                  value={firstName}
                  onChangeText={setFirstName}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  label="Last Name *"
                  value={lastName}
                  onChangeText={setLastName}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
              </View>
              <TextInput
                label="Email *"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
              />
              <TextInput
                label="Password * (min 8 characters)"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
                left={<TextInput.Icon icon="lock" />}
              />
              
              <Button
                mode="contained"
                onPress={handleRegister}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
                icon="account-plus"
              >
                Create Company Account
              </Button>
            </>
          )}

          {/* INVITE FORM */}
          {authMode === 'invite' && (
            <>
              {!inviteInfo ? (
                <>
                  <Text style={styles.sectionLabel}>Enter Invitation Code</Text>
                  <Text style={styles.helperText}>
                    Your company admin should have provided you with an invitation code.
                  </Text>
                  <TextInput
                    label="Invitation Code"
                    value={inviteToken}
                    onChangeText={setInviteToken}
                    mode="outlined"
                    autoCapitalize="none"
                    style={styles.input}
                    left={<TextInput.Icon icon="ticket-confirmation" />}
                  />
                  <Button
                    mode="contained"
                    onPress={handleCheckInvite}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    style={styles.submitButton}
                    icon="check"
                  >
                    Verify Invitation
                  </Button>
                </>
              ) : (
                <>
                  <View style={styles.inviteInfo}>
                    <MaterialCommunityIcons name="check-circle" size={48} color="#4CAF50" />
                    <Text style={styles.inviteCompany}>{inviteInfo.companyName}</Text>
                    <Text style={styles.inviteRole}>
                      You're invited as: <Text style={styles.bold}>{inviteInfo.role}</Text>
                    </Text>
                    <Text style={styles.inviteEmail}>{inviteInfo.email}</Text>
                  </View>
                  
                  <Divider style={styles.divider} />
                  <Text style={styles.sectionLabel}>Complete Your Profile</Text>
                  
                  <View style={styles.row}>
                    <TextInput
                      label="First Name *"
                      value={firstName}
                      onChangeText={setFirstName}
                      mode="outlined"
                      style={[styles.input, styles.halfInput]}
                    />
                    <TextInput
                      label="Last Name *"
                      value={lastName}
                      onChangeText={setLastName}
                      mode="outlined"
                      style={[styles.input, styles.halfInput]}
                    />
                  </View>
                  <TextInput
                    label="Password * (min 8 characters)"
                    value={password}
                    onChangeText={setPassword}
                    mode="outlined"
                    secureTextEntry
                    style={styles.input}
                    left={<TextInput.Icon icon="lock" />}
                  />
                  
                  <Button
                    mode="contained"
                    onPress={handleAcceptInvite}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    style={styles.submitButton}
                    icon="account-check"
                  >
                    Join Company
                  </Button>
                </>
              )}
            </>
          )}

          {/* FORGOT PASSWORD FORM */}
          {authMode === 'forgot' && (
            <>
              <Text style={styles.sectionLabel}>Forgot Password</Text>
              <Text style={styles.helperText}>
                Enter your email address and we'll send you a reset code.
              </Text>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
              />
              <Button
                mode="contained"
                onPress={handleForgotPassword}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
                icon="email-send"
              >
                Send Reset Code
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setAuthMode('login');
                  setError('');
                }}
                style={styles.forgotButton}
              >
                Back to Login
              </Button>
            </>
          )}

          {/* RESET PASSWORD FORM */}
          {authMode === 'reset' && (
            <>
              {resetSuccess ? (
                <View style={styles.successContainer}>
                  <MaterialCommunityIcons name="check-circle" size={64} color="#4CAF50" />
                  <Text style={styles.successTitle}>Password Reset!</Text>
                  <Text style={styles.successText}>
                    Your password has been reset successfully. You can now log in with your new password.
                  </Text>
                  <Button
                    mode="contained"
                    onPress={() => {
                      setAuthMode('login');
                      setResetSuccess(false);
                      setError('');
                    }}
                    style={styles.submitButton}
                    icon="login"
                  >
                    Go to Login
                  </Button>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Reset Password</Text>
                  <Text style={styles.helperText}>
                    Enter the reset code sent to {email} and your new password.
                  </Text>
                  <TextInput
                    label="Reset Code"
                    value={resetCode}
                    onChangeText={setResetCode}
                    mode="outlined"
                    keyboardType="number-pad"
                    style={styles.input}
                    left={<TextInput.Icon icon="key" />}
                  />
                  <TextInput
                    label="New Password (min 8 characters)"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    mode="outlined"
                    secureTextEntry
                    style={styles.input}
                    left={<TextInput.Icon icon="lock" />}
                  />
                  <TextInput
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    mode="outlined"
                    secureTextEntry
                    style={styles.input}
                    left={<TextInput.Icon icon="lock-check" />}
                  />
                  <Button
                    mode="contained"
                    onPress={handleResetPassword}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    style={styles.submitButton}
                    icon="lock-reset"
                  >
                    Reset Password
                  </Button>
                  <Button
                    mode="text"
                    onPress={() => {
                      setAuthMode('forgot');
                      setError('');
                    }}
                    style={styles.forgotButton}
                  >
                    Didn't receive code? Try again
                  </Button>
                </>
              )}
            </>
          )}
        </Surface>

        <View style={styles.footer}>
          <MaterialCommunityIcons name="shield-check" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.footerText}>Secure Multi-Tenant Platform</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 16,
  },
  header: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  authCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  segmentedButtons: {
    marginBottom: 20,
  },
  input: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  divider: {
    marginVertical: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  helperText: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  errorText: {
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  forgotButton: {
    marginTop: 8,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#2E7D32',
  },
  successText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  footerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  inviteInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  inviteCompany: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
  },
  inviteRole: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  inviteEmail: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  bold: {
    fontWeight: 'bold',
    color: '#333',
  },
});
