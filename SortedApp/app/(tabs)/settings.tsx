import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import houseService, { HouseData } from '@/services/houseService';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import premiumService from '@/services/premiumService';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function SettingsScreen() {
  const { userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;

  const [loading, setLoading] = useState(false);
  const [houseData, setHouseData] = useState<HouseData | null>(null);
  const [houseLoading, setHouseLoading] = useState(true);
  const [premiumLoading, setPremiumLoading] = useState(false);

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
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
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
            <ActivityIndicator color={BUTLER_BLUE} />
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
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.detailText}>{userProfile?.name || 'User'}</Text>
          <Text style={styles.helperText}>{userProfile?.email || 'Email not available'}</Text>
          <Text style={[styles.helperText, { marginTop: 8 }]}>
            Profile editing is coming soon.
          </Text>
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
                  <ActivityIndicator color={BUTLER_BLUE} />
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
                  <ActivityIndicator color="#FFFFFF" />
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

        <TouchableOpacity
          style={[styles.signOutButton, loading && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.signOutText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 32,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  detailText: {
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 14,
    color: '#6B7280',
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
    letterSpacing: 1,
  },
  copyButton: {
    backgroundColor: BUTLER_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: BUTLER_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: BUTLER_BLUE,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#EF4444',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

