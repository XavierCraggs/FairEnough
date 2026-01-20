import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  View as RNView,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  Linking,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import houseService, { HouseData } from '@/services/houseService';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import premiumService from '@/services/premiumService';
import profileService from '@/services/profileService';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import { useThemePreference } from '@/contexts/ThemeContext';

const SUPPORT_EMAIL = 'support@sortedapp.app';
const HELP_CENTER_URL = 'https://sortedapp.app/help';
const PRIVACY_URL = 'https://sortedapp.app/privacy';
const TERMS_URL = 'https://sortedapp.app/terms';

export default function SettingsScreen() {
  const { userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { preference, setPreference } = useThemePreference();

  const [loading, setLoading] = useState(false);
  const [houseData, setHouseData] = useState<HouseData | null>(null);
  const [houseLoading, setHouseLoading] = useState(true);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);

  useEffect(() => {
    if (!houseId) {
      setHouseData(null);
      setHouseLoading(false);
      return;
    }

    const fetchHouse = async () => {
      try {
        const house = await houseService.getHouse(houseId);
        setHouseData(house);
      } catch (error: any) {
        Alert.alert('Settings', error.message || 'Unable to load house details.');
      } finally {
        setHouseLoading(false);
      }
    };

    fetchHouse();
  }, [houseId]);

  const currentPhotoUrl = photoPreview || userProfile?.photoUrl || null;

  const handleOpenProfile = () => {
    setNameInput(userProfile?.name || '');
    setEmailInput(userProfile?.email || '');
    setPhotoPreview(null);
    setProfileModalVisible(true);
  };

  const handleCloseProfile = () => {
    if (profileSaving || photoUploading) return;
    setProfileModalVisible(false);
  };

  const handlePickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Profile photo', 'Permission is required to choose a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setPhotoPreview(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Profile photo', 'Unable to open your photo library.');
    }
  };

  const handleSaveProfile = async () => {
    if (!userProfile?.uid) {
      Alert.alert('Profile', 'You must be signed in to update your profile.');
      return;
    }

    const nextName = nameInput.trim();
    const nextEmail = emailInput.trim();
    const nameChanged = nextName && nextName !== (userProfile.name || '');
    const emailChanged =
      nextEmail &&
      nextEmail.toLowerCase() !== (userProfile.email || '').toLowerCase();
    const photoChanged = !!photoPreview;

    if (!nameChanged && !emailChanged && !photoChanged) {
      setProfileModalVisible(false);
      return;
    }

    setProfileSaving(true);
    try {
      if (nameChanged) {
        await authService.updateUserName(nextName);
      }
      if (emailChanged) {
        await authService.updateUserEmail(nextEmail);
      }
      if (photoChanged) {
        setPhotoUploading(true);
        await profileService.uploadProfilePhoto(userProfile.uid, photoPreview as string);
      }
      setProfileModalVisible(false);
      setPhotoPreview(null);
    } catch (error: any) {
      Alert.alert('Profile', error?.message || 'Unable to update profile.');
    } finally {
      setProfileSaving(false);
      setPhotoUploading(false);
    }
  };

  const handleLeaveHouse = async () => {
    if (!houseId || !userProfile?.uid) {
      return;
    }

    Alert.alert(
      'Leave house',
      'This will remove you from the house and reset your points. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaveLoading(true);
            try {
              await houseService.leaveHouse(userProfile.uid, houseId);
            } catch (error: any) {
              Alert.alert('Settings', error?.message || 'Unable to leave house.');
            } finally {
              setLeaveLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Settings', 'Unable to open that link.');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await authService.signOut();
              router.replace('/(auth)/login');
            } catch (err) {
              const authError = err as AuthServiceError;
              Alert.alert('Error', authError.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCopyInviteCode = async () => {
    if (!houseData?.inviteCode) return;
    try {
      await Clipboard.setStringAsync(houseData.inviteCode);
      Alert.alert('Copied', 'Invite code copied to clipboard.');
    } catch (error) {
      Alert.alert('Settings', 'Unable to copy invite code.');
    }
  };

  const handleUpgrade = async () => {
    if (!houseId || !userProfile?.uid) {
      Alert.alert('Premium', 'Join a house before upgrading.');
      return;
    }

    setPremiumLoading(true);
    try {
      await premiumService.purchaseHousePass({
        houseId,
        userId: userProfile.uid,
        userName: userProfile.name,
      });
      Alert.alert('Premium', 'House Pass activated for your household.');
    } catch (error: any) {
      Alert.alert('Premium', error?.message || 'Unable to start subscription.');
    } finally {
      setPremiumLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!houseId || !userProfile?.uid) {
      Alert.alert('Premium', 'Join a house before restoring purchases.');
      return;
    }

    setPremiumLoading(true);
    try {
      await premiumService.restoreHousePass({
        houseId,
        userId: userProfile.uid,
        userName: userProfile.name,
      });
      Alert.alert('Premium', 'Restored House Pass status.');
    } catch (error: any) {
      Alert.alert('Premium', error?.message || 'Unable to restore purchases.');
    } finally {
      setPremiumLoading(false);
    }
  };

  const handleManage = async () => {
    try {
      await premiumService.openManageSubscriptions();
    } catch (error: any) {
      Alert.alert('Premium', error?.message || 'Unable to open subscription settings.');
    }
  };

  const premiumExpiresAt =
    houseData?.premium?.expiresAt?.toDate?.() ?? null;
  const premiumStatusLine = houseData?.isPremium
    ? premiumExpiresAt
      ? `Renews on ${premiumExpiresAt.toLocaleDateString()}`
      : 'House Pass is active.'
    : 'Unlock calendar sync, receipt OCR, and advanced analytics for your house.';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={colors.background} darkColor={colors.background}>
        <Text style={styles.title}>Settings</Text>

        {!houseId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Join a House</Text>
            <Text style={styles.description}>
              Settings work best once you are part of a house. Join or create one to unlock
              shared features.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/(auth)/house-setup')}
            >
              <Text style={styles.primaryButtonText}>Set up house</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>House Details</Text>
          {houseLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : houseData ? (
            <>
              <Text style={styles.detailText}>{houseData.name}</Text>
              <RNView style={styles.inviteRow}>
                <Text style={styles.inviteCodeText}>{houseData.inviteCode}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyInviteCode}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </RNView>
              <Text style={styles.helperText}>Share this invite code to add housemates.</Text>
            </>
          ) : (
            <Text style={styles.description}>House details are unavailable right now.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <RNView style={styles.profileRow}>
            <RNView style={styles.avatarWrapper}>
              {currentPhotoUrl ? (
                <Image source={{ uri: currentPhotoUrl }} style={styles.avatarImage} />
              ) : (
                <RNView style={styles.avatarPlaceholder}>
                  <FontAwesome name="user" size={22} color={colors.accent} />
                </RNView>
              )}
            </RNView>
            <RNView style={styles.profileMeta}>
              <Text style={styles.detailText}>{userProfile?.name || 'User'}</Text>
              <RNView style={styles.infoRow}>
                <FontAwesome name="envelope" size={12} color={colors.muted} />
                <Text style={[styles.helperText, styles.infoText]}>
                  {userProfile?.email || 'Email not available'}
                </Text>
              </RNView>
              <RNView style={styles.infoRow}>
                <FontAwesome name="phone" size={12} color={colors.muted} />
                <Text style={[styles.helperText, styles.infoText]}>
                  {userProfile?.phone || 'Phone not set'}
                </Text>
              </RNView>
            </RNView>
          </RNView>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenProfile}>
            <Text style={styles.secondaryButtonText}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium</Text>
          <Text style={styles.description}>{premiumStatusLine}</Text>
          {houseData?.isPremium ? (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, premiumLoading && styles.buttonDisabled]}
                onPress={handleManage}
                disabled={premiumLoading}
              >
                <Text style={styles.primaryButtonText}>Manage subscription</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, premiumLoading && styles.buttonDisabled]}
                onPress={handleRestore}
                disabled={premiumLoading}
              >
                {premiumLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Restore purchases</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, premiumLoading && styles.buttonDisabled]}
                onPress={handleUpgrade}
                disabled={premiumLoading}
              >
                {premiumLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryButtonText}>Upgrade to Premium</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, premiumLoading && styles.buttonDisabled]}
                onPress={handleRestore}
                disabled={premiumLoading}
              >
                <Text style={styles.secondaryButtonText}>Restore purchases</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Preferences</Text>
          <RNView style={styles.settingRow}>
            <RNView style={styles.settingIcon}>
              <FontAwesome name="moon-o" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Appearance</Text>
              <Text style={styles.helperText}>Match your device or choose a mode.</Text>
            </RNView>
          </RNView>
          <RNView style={styles.toggleGroup}>
            {['system', 'light', 'dark'].map((value) => {
              const isActive = preference === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.toggleChip,
                    isActive && styles.toggleChipActive,
                  ]}
                  onPress={() => setPreference(value as 'system' | 'light' | 'dark')}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      isActive && styles.toggleChipTextActive,
                    ]}
                  >
                    {value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RNView>
          <RNView style={styles.settingRow}>
            <RNView style={styles.settingIcon}>
              <FontAwesome name="globe" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Language</Text>
              <Text style={styles.helperText}>English (default)</Text>
            </RNView>
            <Text style={styles.settingBadge}>Soon</Text>
          </RNView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Legal</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => handleOpenLink(`mailto:${SUPPORT_EMAIL}?subject=Bug%20Report`)}
          >
            <RNView style={styles.settingIcon}>
              <FontAwesome name="bug" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Report a bug</Text>
              <Text style={styles.helperText}>{SUPPORT_EMAIL}</Text>
            </RNView>
            <FontAwesome name="chevron-right" size={12} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => handleOpenLink(HELP_CENTER_URL)}
          >
            <RNView style={styles.settingIcon}>
              <FontAwesome name="life-ring" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Help center</Text>
              <Text style={styles.helperText}>FAQs and support</Text>
            </RNView>
            <FontAwesome name="chevron-right" size={12} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => handleOpenLink(PRIVACY_URL)}
          >
            <RNView style={styles.settingIcon}>
              <FontAwesome name="shield" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Privacy policy</Text>
              <Text style={styles.helperText}>How we handle your data</Text>
            </RNView>
            <FontAwesome name="chevron-right" size={12} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => handleOpenLink(TERMS_URL)}
          >
            <RNView style={styles.settingIcon}>
              <FontAwesome name="file-text" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Terms of service</Text>
              <Text style={styles.helperText}>Usage and billing terms</Text>
            </RNView>
            <FontAwesome name="chevron-right" size={12} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          {houseId && (
            <TouchableOpacity
              style={[styles.dangerButton, leaveLoading && styles.buttonDisabled]}
              onPress={handleLeaveHouse}
              disabled={leaveLoading}
            >
              {leaveLoading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.dangerButtonText}>Leave house</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.signOutButton, loading && styles.buttonDisabled]}
            onPress={handleSignOut}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onDanger} />
            ) : (
              <Text style={styles.signOutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={profileModalVisible}
          transparent
          animationType="slide"
          onRequestClose={handleCloseProfile}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              style={styles.modalBackdrop}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <RNView style={styles.modalContent}>
                <RNView style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Profile</Text>
                  <TouchableOpacity onPress={handleCloseProfile}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </RNView>

                <RNView style={styles.profileModalRow}>
                  <RNView style={styles.avatarWrapper}>
                    {currentPhotoUrl ? (
                      <Image source={{ uri: currentPhotoUrl }} style={styles.avatarImage} />
                    ) : (
                      <RNView style={styles.avatarPlaceholder}>
                        <FontAwesome name="user" size={22} color={colors.accent} />
                      </RNView>
                    )}
                  </RNView>
                  <RNView style={styles.profileModalActions}>
                    <Text style={styles.modalLabel}>Profile photo</Text>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handlePickPhoto}
                      disabled={photoUploading || profileSaving}
                    >
                      <Text style={styles.secondaryButtonText}>Change photo</Text>
                    </TouchableOpacity>
                  </RNView>
                </RNView>

                <Text style={styles.modalLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.modalLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="name@email.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.modalHelperText}>
                  Updating email may require re-authentication.
                </Text>

                <RNView style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={handleCloseProfile}
                    disabled={profileSaving || photoUploading}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalPrimaryButton]}
                    onPress={handleSaveProfile}
                    disabled={profileSaving || photoUploading}
                  >
                    {profileSaving || photoUploading ? (
                      <ActivityIndicator color={colors.onAccent} />
                    ) : (
                      <Text style={styles.modalPrimaryText}>Save changes</Text>
                    )}
                  </TouchableOpacity>
                </RNView>
              </RNView>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 32,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 24,
  },
  detailText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 14,
    color: colors.muted,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  profileMeta: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  infoText: {
    marginLeft: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingBody: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  settingBadge: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  toggleGroup: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 8,
  },
  toggleChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  toggleChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleChipText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  toggleChipTextActive: {
    color: colors.onAccent,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 1,
  },
  copyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  dangerButtonText: {
    color: colors.onDanger,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    color: colors.onDanger,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
  },
  modalCloseText: {
    fontSize: 14,
    color: colors.muted,
  },
  modalLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 12,
  },
  modalHelperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  profileModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileModalActions: {
    flex: 1,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginLeft: 8,
  },
  modalCancelButton: {
    backgroundColor: colors.accentSoft,
  },
  modalPrimaryButton: {
    backgroundColor: colors.accent,
  },
  modalCancelText: {
    color: colors.accent,
    fontWeight: '500',
  },
  modalPrimaryText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  });

