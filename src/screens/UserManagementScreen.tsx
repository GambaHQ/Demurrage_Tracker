// User Management Screen - Admin view for managing company users
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Share } from 'react-native';
import {
  Card,
  Title,
  Text,
  Button,
  Surface,
  useTheme,
  Portal,
  Dialog,
  TextInput,
  RadioButton,
  List,
  Avatar,
  Chip,
  Divider,
  ActivityIndicator,
  FAB,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import * as api from '../services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'owner' | 'admin' | 'driver';
  isActive?: boolean;
  createdAt?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export default function UserManagementScreen() {
  const theme = useTheme();
  const { user: currentUser, company } = useAppStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  
  // Invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'driver'>('driver');
  const [isInviting, setIsInviting] = useState(false);
  
  // Last invite result
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [showInviteSentDialog, setShowInviteSentDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersResponse, invitationsResponse] = await Promise.all([
        api.getCompanyUsers(),
        api.getPendingInvitations(),
      ]);
      
      if (usersResponse.success && usersResponse.data) {
        setUsers(usersResponse.data);
      }
      
      if (invitationsResponse.success && invitationsResponse.data) {
        setInvitations(invitationsResponse.data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    }
    setIsLoading(false);
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    
    setIsInviting(true);
    try {
      const response = await api.inviteUser({
        email: inviteEmail,
        role: inviteRole,
      });
      
      if (response.success && response.data) {
        setLastInviteLink(response.data.inviteLink);
        setShowInviteDialog(false);
        setShowInviteSentDialog(true);
        setInviteEmail('');
        setInviteRole('driver');
        
        // Reload invitations
        const invitationsResponse = await api.getPendingInvitations();
        if (invitationsResponse.success && invitationsResponse.data) {
          setInvitations(invitationsResponse.data);
        }
      } else {
        Alert.alert('Error', response.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    }
    setIsInviting(false);
  };

  const handleShareInvite = async () => {
    if (!lastInviteLink) return;
    
    try {
      await Share.share({
        message: `You've been invited to join ${company?.name} on Demurrage Tracker! Use this invitation code to sign up: ${lastInviteLink}`,
        title: 'Demurrage Tracker Invitation',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return '#9C27B0';
      case 'admin':
        return '#2196F3';
      case 'driver':
        return '#4CAF50';
      default:
        return '#666';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return 'crown';
      case 'admin':
        return 'shield-account';
      case 'driver':
        return 'truck';
      default:
        return 'account';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Company Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.companyHeader}>
              <MaterialCommunityIcons name="domain" size={32} color={theme.colors.primary} />
              <View style={styles.companyInfo}>
                <Title>{company?.name || 'Your Company'}</Title>
                <Text style={styles.companyEmail}>{company?.email}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Users List */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Team Members ({users.length})</Title>
            
            {users.map((user, index) => (
              <React.Fragment key={user.id}>
                {index > 0 && <Divider style={styles.divider} />}
                <List.Item
                  title={`${user.firstName} ${user.lastName}`}
                  description={user.email}
                  left={() => (
                    <Avatar.Icon
                      size={40}
                      icon={getRoleIcon(user.role)}
                      style={{ backgroundColor: getRoleColor(user.role) }}
                    />
                  )}
                  right={() => (
                    <View style={styles.userRight}>
                      <Chip
                        style={[styles.roleChip, { borderColor: getRoleColor(user.role) }]}
                        textStyle={{ color: getRoleColor(user.role), fontSize: 12 }}
                        mode="outlined"
                      >
                        {user.role.toUpperCase()}
                      </Chip>
                      {!user.isActive && (
                        <Chip style={styles.inactiveChip}>Inactive</Chip>
                      )}
                    </View>
                  )}
                  style={styles.userItem}
                />
              </React.Fragment>
            ))}
          </Card.Content>
        </Card>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>Pending Invitations ({invitations.length})</Title>
              
              {invitations.map((invite, index) => (
                <React.Fragment key={invite.id}>
                  {index > 0 && <Divider style={styles.divider} />}
                  <List.Item
                    title={invite.email}
                    description={`Invited as ${invite.role} • Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                    left={() => (
                      <Avatar.Icon
                        size={40}
                        icon="email-outline"
                        style={{ backgroundColor: '#FF9800' }}
                      />
                    )}
                    style={styles.userItem}
                  />
                </React.Fragment>
              ))}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* FAB for inviting users */}
      {(currentUser?.role === 'owner' || currentUser?.role === 'admin') && (
        <FAB
          icon="account-plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowInviteDialog(true)}
          label="Invite User"
        />
      )}

      {/* Invite Dialog */}
      <Portal>
        <Dialog visible={showInviteDialog} onDismiss={() => setShowInviteDialog(false)}>
          <Dialog.Title>Invite Team Member</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Email Address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.dialogInput}
              left={<TextInput.Icon icon="email" />}
            />
            
            <Text style={styles.roleLabel}>Select Role:</Text>
            <RadioButton.Group
              onValueChange={(value) => setInviteRole(value as 'admin' | 'driver')}
              value={inviteRole}
            >
              <RadioButton.Item
                label="Driver"
                value="driver"
                style={styles.radioItem}
              />
              <Text style={styles.roleDescription}>
                Can start/stop tracking only
              </Text>
              
              <RadioButton.Item
                label="Admin"
                value="admin"
                style={styles.radioItem}
              />
              <Text style={styles.roleDescription}>
                Can manage users, view history, and generate invoices
              </Text>
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button
              onPress={handleInviteUser}
              loading={isInviting}
              disabled={isInviting || !inviteEmail}
              mode="contained"
            >
              Send Invite
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Invite Sent Dialog */}
      <Portal>
        <Dialog visible={showInviteSentDialog} onDismiss={() => setShowInviteSentDialog(false)}>
          <Dialog.Title>Invitation Sent!</Dialog.Title>
          <Dialog.Content>
            <View style={styles.successIcon}>
              <MaterialCommunityIcons name="check-circle" size={64} color="#4CAF50" />
            </View>
            <Text style={styles.successText}>
              An invitation has been created. Share the link with the user to let them join your company.
            </Text>
            <Surface style={styles.inviteLinkBox} elevation={1}>
              <Text style={styles.inviteLinkText} numberOfLines={2}>
                {lastInviteLink}
              </Text>
            </Surface>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowInviteSentDialog(false)}>Close</Button>
            <Button onPress={handleShareInvite} mode="contained" icon="share">
              Share Link
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  companyInfo: {
    flex: 1,
  },
  companyEmail: {
    color: '#666',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  divider: {
    marginVertical: 8,
  },
  userItem: {
    paddingVertical: 8,
  },
  userRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  roleChip: {
    height: 28,
  },
  inactiveChip: {
    backgroundColor: '#ffebee',
    height: 24,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogInput: {
    marginBottom: 16,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666',
  },
  radioItem: {
    paddingVertical: 4,
  },
  roleDescription: {
    fontSize: 12,
    color: '#888',
    marginLeft: 52,
    marginTop: -8,
    marginBottom: 8,
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successText: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 16,
  },
  inviteLinkBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  inviteLinkText: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
  },
});
