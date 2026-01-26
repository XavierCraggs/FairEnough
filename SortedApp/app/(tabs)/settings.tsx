import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import houseService, { HouseData } from '@/services/houseService';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import premiumService from '@/services/premiumService';
import profileService from '@/services/profileService';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme, themeLabels, themeOrder, ThemeName } from '@/constants/AppColors';
import { useThemePreference } from '@/contexts/ThemeContext';
import ScreenShell from '@/components/ScreenShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFirstName } from '@/utils/name';
import notificationService from '@/services/notificationService';
import choreService from '@/services/choreService';
import financeService from '@/services/financeService';
import calendarService from '@/services/calendarService';
import { Image } from 'expo-image';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/api/firebase';

const SUPPORT_EMAIL = 'support@sortedapp.app';
const HELP_CENTER_URL = 'https://sortedapp.app/help';
const PRIVACY_URL = 'https://sortedapp.app/privacy';
const TERMS_URL = 'https://sortedapp.app/terms';
const ADMIN_UIDS = ['kfimxeubPFR7kSyYtd2UZbmMAuC2'];

export default function SettingsScreen() {
  const { userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;
  const currentUserId = userProfile?.uid ?? null;
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + 120;
  const scrollY = useRef(new Animated.Value(0));
  const headerOpacity = scrollY.current.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.92],
    extrapolate: 'clamp',
  });
  const { preference, setPreference, themeName, setThemeName } = useThemePreference();
  const isAdmin = !!currentUserId && ADMIN_UIDS.includes(currentUserId);

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
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [houseNameEditing, setHouseNameEditing] = useState(false);
  const [houseNameInput, setHouseNameInput] = useState('');
  const [houseNameSaving, setHouseNameSaving] = useState(false);
  const [members, setMembers] = useState<
    Array<{ userId: string; name: string; photoUrl?: string | null }>
  >([]);

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

  useEffect(() => {
    if (!houseId) {
      setMembers([]);
      return;
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('houseId', '==', houseId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextMembers = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            userId: doc.id,
            name: data.name || 'Unnamed',
            photoUrl: data.photoUrl || data.photoURL || null,
          };
        });
        setMembers(nextMembers);
      },
      () => {
        setMembers([]);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  useEffect(() => {
    if (!houseData?.name) return;
    setHouseNameInput(houseData.name);
  }, [houseData?.name]);

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

  const handleStartHouseNameEdit = () => {
    if (!houseData?.name) return;
    setHouseNameInput(houseData.name);
    setHouseNameEditing(true);
  };

  const handleCancelHouseNameEdit = () => {
    setHouseNameEditing(false);
    if (houseData?.name) {
      setHouseNameInput(houseData.name);
    }
  };

  const handleSaveHouseName = async () => {
    if (!houseId || !currentUserId) return;
    const nextName = houseNameInput.trim();
    if (!nextName) {
      Alert.alert('House name', 'Please enter a house name.');
      return;
    }
    if (nextName === houseData?.name) {
      setHouseNameEditing(false);
      return;
    }
    setHouseNameSaving(true);
    try {
      await houseService.updateHouseName(houseId, currentUserId, nextName);
      setHouseData((prev) => (prev ? { ...prev, name: nextName } : prev));
      setHouseNameEditing(false);
    } catch (error: any) {
      Alert.alert('House name', error?.message || 'Unable to update house name.');
    } finally {
      setHouseNameSaving(false);
    }
  };

  const handleToggleAvoidRepeat = async (value: boolean) => {
    if (!houseId || !currentUserId) {
      return;
    }
    if (preferencesSaving) {
      return;
    }
    setPreferencesSaving(true);
    try {
      await houseService.updateHousePreferences(houseId, currentUserId, {
        choreRotationAvoidRepeat: value,
      });
    } catch (error: any) {
      Alert.alert('Settings', error?.message || 'Unable to update chore settings.');
    } finally {
      setPreferencesSaving(false);
    }
  };

  const premiumExpiresAt =
    houseData?.premium?.expiresAt?.toDate?.() ?? null;
  const premiumStatusLine = houseData?.isPremium
    ? premiumExpiresAt
      ? `Renews on ${premiumExpiresAt.toLocaleDateString()}`
      : 'House Pass is active.'
    : 'Unlock calendar sync, receipt OCR, and advanced analytics for your house.';
  const avoidRepeat = houseData?.choreRotationAvoidRepeat !== false;

  const handleSendTestNotification = async (type: string) => {
    if (!houseId || !currentUserId) return;
    try {
      const metadata =
        type === 'BILL_ADDED'
          ? { amount: 24.5, description: 'Test bill' }
          : type === 'BILL_CONTESTED'
          ? { reason: 'Amount looks wrong', transactionId: 'test' }
          : type === 'CHORE_DUE'
          ? { choreName: 'Test chore', action: 'overdue' }
          : type === 'MEETING_REQUEST'
          ? { subject: 'a quick house check-in' }
          : { subject: 'test notification' };

      await notificationService.sendAlfredNudge(
        houseId,
        currentUserId,
        type as any,
        metadata
      );
      Alert.alert('Admin', 'Test notification sent.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to send notification.');
    }
  };

  const handleCreateTestBill = async () => {
    if (!houseId || !currentUserId) return;
    try {
      const splitWith = houseData?.members?.length
        ? houseData.members
        : [currentUserId];
      await financeService.addTransaction(
        houseId,
        currentUserId,
        42.5,
        'Test bill',
        splitWith
      );
      Alert.alert('Admin', 'Test bill created.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to create test bill.');
    }
  };

  const handleCreateTestChore = async () => {
    if (!houseId || !currentUserId) return;
    try {
      await choreService.addChore({
        houseId,
        title: 'Test chore',
        description: 'Admin seeded chore',
        points: 4,
        assignedTo: currentUserId,
        frequency: 'weekly',
        createdBy: currentUserId,
      });
      Alert.alert('Admin', 'Test chore created.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to create test chore.');
    }
  };

  const handleCreateTestEvent = async () => {
    if (!houseId || !currentUserId) return;
    try {
      const startDate = new Date();
      await calendarService.addEvent(
        houseId,
        currentUserId,
        'Test event',
        startDate,
        'Admin seeded event',
        {
          frequency: 'none',
          interval: 1,
          endDate: null,
        }
      );
      Alert.alert('Admin', 'Test event created.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to create test event.');
    }
  };

  return (
    <ScreenShell style={styles.container}>
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <RNView style={[styles.content, { paddingBottom: bottomPadding }]}>
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
          <Text style={styles.sectionTitle}>Profile</Text>
          <RNView style={styles.profileRow}>
            <RNView style={styles.avatarWrapper}>
              {currentPhotoUrl ? (
                <Image
                  source={{ uri: currentPhotoUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="disk"
                  transition={150}
                />
              ) : (
                <RNView style={styles.avatarPlaceholder}>
                  <FontAwesome name="user" size={22} color={colors.accent} />
                </RNView>
              )}
            </RNView>
            <RNView style={styles.profileMeta}>
              <Text style={styles.detailText}>
                {getFirstName(userProfile?.name || 'User', 'User')}
              </Text>
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
          <Text style={styles.sectionTitle}>House Details</Text>
          {houseLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : houseData ? (
            <>
              <RNView style={styles.houseHeaderRow}>
                {houseNameEditing ? (
                  <TextInput
                    style={styles.houseNameInput}
                    value={houseNameInput}
                    onChangeText={setHouseNameInput}
                    placeholder="House name"
                    placeholderTextColor={colors.muted}
                  />
                ) : (
                  <Text style={styles.detailText}>{houseData.name}</Text>
                )}
                {houseNameEditing ? (
                  <RNView style={styles.houseNameActions}>
                    <TouchableOpacity
                      style={styles.houseNameActionButton}
                      onPress={handleCancelHouseNameEdit}
                      disabled={houseNameSaving}
                    >
                      <Text style={styles.houseNameActionText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.houseNameActionButton,
                        styles.houseNameActionPrimary,
                        houseNameSaving && styles.buttonDisabled,
                      ]}
                      onPress={handleSaveHouseName}
                      disabled={houseNameSaving}
                    >
                      {houseNameSaving ? (
                        <ActivityIndicator color={colors.onAccent} />
                      ) : (
                        <Text style={styles.houseNameActionPrimaryText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </RNView>
                ) : (
                  <TouchableOpacity
                    style={styles.houseEditButton}
                    onPress={handleStartHouseNameEdit}
                  >
                    <FontAwesome name="pencil" size={14} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </RNView>
              <RNView style={styles.inviteRow}>
                <Text style={styles.inviteCodeText}>{houseData.inviteCode}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyInviteCode}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </RNView>
              <Text style={styles.inviteHelperText}>
                Share this invite code to add housemates.
              </Text>
              <Text style={styles.subsectionTitle}>Members</Text>
              <RNView style={styles.memberList}>
                {members.length === 0 ? (
                  <Text style={styles.helperText}>No members found.</Text>
                ) : (
                  members.map((member) => (
                    <RNView key={member.userId} style={styles.memberChip}>
                      {member.photoUrl ? (
                        <Image
                          source={{ uri: member.photoUrl }}
                          style={styles.memberAvatar}
                          contentFit="cover"
                          cachePolicy="disk"
                          transition={150}
                        />
                      ) : (
                        <RNView style={styles.memberAvatarFallback}>
                          <Text style={styles.memberAvatarText}>
                            {getFirstName(member.name, 'U')[0]}
                          </Text>
                        </RNView>
                      )}
                      <Text style={styles.memberNameText}>
                        {getFirstName(member.name, 'Housemate')}
                      </Text>
                    </RNView>
                  ))
                )}
              </RNView>
              <RNView style={[styles.settingRow, styles.settingRowTight]}>
                <RNView style={styles.settingIcon}>
                  <FontAwesome name="repeat" size={16} color={colors.accent} />
                </RNView>
                <RNView style={styles.settingBody}>
                  <Text style={styles.settingLabel}>Chore rotation</Text>
                  <Text style={styles.helperText}>
                    Avoid assigning the same person twice in a row.
                  </Text>
                </RNView>
              </RNView>
              <RNView style={styles.toggleGroup}>
                {[true, false].map((value) => {
                  const isActive = avoidRepeat === value;
                  return (
                    <TouchableOpacity
                      key={value ? 'avoid' : 'allow'}
                      style={[
                        styles.toggleChip,
                        isActive && styles.toggleChipActive,
                      ]}
                      onPress={() => handleToggleAvoidRepeat(value)}
                      disabled={preferencesSaving}
                    >
                      <Text
                        style={[
                          styles.toggleChipText,
                          isActive && styles.toggleChipTextActive,
                        ]}
                      >
                        {value ? 'Avoid repeats' : 'Allow repeats'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </RNView>
            </>
          ) : (
            <Text style={styles.description}>House details are unavailable right now.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium</Text>
          <Text style={styles.description}>{premiumStatusLine}</Text>
          <RNView style={styles.premiumFeatureRow}>
            <Text style={styles.premiumFeatureText}>iPad mode (coming soon)</Text>
            <Text style={styles.premiumBadge}>Premium</Text>
          </RNView>
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
              <FontAwesome name="paint-brush" size={16} color={colors.accent} />
            </RNView>
            <RNView style={styles.settingBody}>
              <Text style={styles.settingLabel}>Color theme</Text>
              <Text style={styles.helperText}>Pick a palette you like.</Text>
            </RNView>
          </RNView>
          <RNView style={styles.themeGroup}>
            {themeOrder.map((value) => {
              const isActive = themeName === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.themeChip, isActive && styles.themeChipActive]}
                  onPress={() => setThemeName(value as ThemeName)}
                >
                  <Text style={[styles.themeChipText, isActive && styles.themeChipTextActive]}>
                    {themeLabels[value]}
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

        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Tools</Text>
            <Text style={styles.description}>
              Send test notifications or seed demo data for this house.
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                Alert.alert('Send test notification', 'Choose a type', [
                  { text: 'Bill added', onPress: () => handleSendTestNotification('BILL_ADDED') },
                  {
                    text: 'Bill contested',
                    onPress: () => handleSendTestNotification('BILL_CONTESTED'),
                  },
                  { text: 'Chore due', onPress: () => handleSendTestNotification('CHORE_DUE') },
                  {
                    text: 'Meeting request',
                    onPress: () => handleSendTestNotification('MEETING_REQUEST'),
                  },
                  { text: 'Nudge', onPress: () => handleSendTestNotification('NUDGE') },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            >
              <Text style={styles.secondaryButtonText}>Send test notification</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateTestBill}>
              <Text style={styles.secondaryButtonText}>Create test bill</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateTestChore}>
              <Text style={styles.secondaryButtonText}>Create test chore</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateTestEvent}>
              <Text style={styles.secondaryButtonText}>Create test event</Text>
            </TouchableOpacity>
          </View>
        )}

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
                      <Image
                        source={{ uri: currentPhotoUrl }}
                        style={styles.avatarImage}
                        contentFit="cover"
                        cachePolicy="disk"
                        transition={150}
                      />
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
        </RNView>
      </Animated.ScrollView>

    <Animated.View
      pointerEvents="none"
      style={[
        styles.stickyHeader,
        {
          paddingTop: insets.top,
          height: insets.top + 56,
          opacity: headerOpacity,
        },
      ]}
    >
      <Text style={styles.stickyHeaderTitle}>Settings</Text>
    </Animated.View>
    </ScreenShell>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 26,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 32,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.4,
    marginBottom: 10,
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
  inviteHelperText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
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
  settingRowTight: {
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 0,
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  settingBadge: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  premiumFeatureRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  premiumFeatureText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  premiumBadge: {
    fontSize: 11,
    color: colors.onAccent,
    fontWeight: '700',
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
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
  houseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  houseEditButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  houseNameInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  houseNameActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  houseNameActionButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
    marginLeft: 6,
  },
  houseNameActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  houseNameActionPrimary: {
    backgroundColor: colors.accent,
  },
  houseNameActionPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onAccent,
  },
  memberList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
  },
  memberAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  memberNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  themeGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 8,
  },
  themeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  themeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  themeChipText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  themeChipTextActive: {
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

