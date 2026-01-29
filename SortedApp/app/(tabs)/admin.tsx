import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import ScreenShell from '@/components/ScreenShell';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notificationService from '@/services/notificationService';
import choreService from '@/services/choreService';
import financeService from '@/services/financeService';
import calendarService from '@/services/calendarService';
import houseService from '@/services/houseService';

type AdminHouseEntry = {
  houseId: string;
  inviteCode?: string;
  label?: string;
};

const STORAGE_KEY = 'admin_house_list';

export default function AdminScreen() {
  const { user, userProfile, isAdmin, activeHouseId, adminHouseOverride, setAdminHouseOverride } =
    useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [houses, setHouses] = useState<AdminHouseEntry[]>([]);
  const [houseIdInput, setHouseIdInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as AdminHouseEntry[];
        if (Array.isArray(parsed)) {
          setHouses(parsed);
        }
      })
      .catch(() => undefined);
  }, []);

  const persist = async (next: AdminHouseEntry[]) => {
    setHouses(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleAddHouse = async () => {
    const rawInput = houseIdInput.trim();
    if (!rawInput) {
      Alert.alert('Admin', 'Enter an invite code or house ID.');
      return;
    }
    setSaving(true);
    try {
      let resolvedHouseId = rawInput;
      let inviteCode: string | undefined;
      const normalizedCode = rawInput.toUpperCase();
      const looksLikeInvite = /^[A-Z0-9]{6}$/.test(normalizedCode);

      if (looksLikeInvite) {
        const resolved = await houseService.resolveHouseIdByInviteCode(normalizedCode);
        if (!resolved) {
          Alert.alert('Admin', 'Invite code not found.');
          return;
        }
        resolvedHouseId = resolved;
        inviteCode = normalizedCode;
      }

      const entry: AdminHouseEntry = {
        houseId: resolvedHouseId,
        inviteCode,
        label: labelInput.trim() || undefined,
      };
      const next = [entry, ...houses.filter((item) => item.houseId !== entry.houseId)];
      await persist(next);
      setHouseIdInput('');
      setLabelInput('');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to save house list.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveHouse = async (houseId: string) => {
    const next = houses.filter((item) => item.houseId !== houseId);
    try {
      await persist(next);
    } catch {
      Alert.alert('Admin', 'Unable to update house list.');
    }
  };

  const currentHouseId = userProfile?.houseId ?? null;
  const displayHouseId = activeHouseId ?? currentHouseId;

  const handleSendTestNotification = async (type: string) => {
    if (!displayHouseId || !user?.uid) return;
    setSending(true);
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
        displayHouseId,
        user.uid,
        type as any,
        metadata
      );
      Alert.alert('Admin', 'Test notification sent.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to send notification.');
    } finally {
      setSending(false);
    }
  };

  const handleCreateTestBill = async () => {
    if (!displayHouseId || !user?.uid) return;
    try {
      await financeService.addTransaction(
        displayHouseId,
        user.uid,
        42.5,
        'Test bill',
        [user.uid]
      );
      Alert.alert('Admin', 'Test bill created.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to create test bill.');
    }
  };

  const handleCreateTestChore = async () => {
    if (!displayHouseId || !user?.uid) return;
    try {
      await choreService.addChore({
        houseId: displayHouseId,
        title: 'Test chore',
        description: 'Admin seeded chore',
        points: 4,
        assignedTo: user.uid,
        frequency: 'weekly',
        createdBy: user.uid,
      });
      Alert.alert('Admin', 'Test chore created.');
    } catch (error: any) {
      Alert.alert('Admin', error?.message || 'Unable to create test chore.');
    }
  };

  const handleCreateTestEvent = async () => {
    if (!displayHouseId || !user?.uid) return;
    try {
      const startDate = new Date();
      await calendarService.addEvent(
        displayHouseId,
        user.uid,
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

  if (!isAdmin) {
    return (
      <ScreenShell>
        <View style={styles.container}>
          <Text style={styles.title}>Admin</Text>
          <Text style={styles.subtitle}>You do not have access to this page.</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <View style={styles.container}>
        <Text style={styles.title}>Admin Panel</Text>
        <Text style={styles.subtitle}>
          Switch between houses and run admin-only tools.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>House Switcher</Text>
          <Text style={styles.helperText}>
            Active house: {displayHouseId || 'None'}
          </Text>
          {adminHouseOverride ? (
            <TouchableOpacity
              style={[styles.secondaryButton, styles.secondaryButtonTight]}
              onPress={() => setAdminHouseOverride(null)}
            >
              <Text style={styles.secondaryButtonText}>Return to my house</Text>
            </TouchableOpacity>
          ) : null}

          <RNView style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="Invite code or house ID"
              placeholderTextColor={colors.muted}
              value={houseIdInput}
              onChangeText={setHouseIdInput}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Label (optional)"
              placeholderTextColor={colors.muted}
              value={labelInput}
              onChangeText={setLabelInput}
            />
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleAddHouse}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>Add house</Text>
              )}
            </TouchableOpacity>
          </RNView>

          <RNView style={styles.houseList}>
            {houses.length === 0 ? (
              <Text style={styles.helperText}>No houses saved yet.</Text>
            ) : (
              houses.map((house) => (
                <RNView key={house.houseId} style={styles.houseRow}>
                  <RNView style={styles.houseRowText}>
                    <Text style={styles.houseRowTitle}>
                      {house.label || 'House'}
                    </Text>
                    {house.inviteCode ? (
                      <Text style={styles.houseRowSubtitle}>
                        Invite {house.inviteCode} · {house.houseId}
                      </Text>
                    ) : (
                      <Text style={styles.houseRowSubtitle}>{house.houseId}</Text>
                    )}
                  </RNView>
                  <RNView style={styles.houseRowActions}>
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setAdminHouseOverride(house.houseId)}
                    >
                      <Text style={styles.linkButtonText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => handleRemoveHouse(house.houseId)}
                    >
                      <Text style={styles.linkButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </RNView>
                </RNView>
              ))
            )}
          </RNView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Tools</Text>
          <Text style={styles.helperText}>
            Actions run against the active house.
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, sending && styles.buttonDisabled]}
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
            disabled={sending}
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
      </View>
    </ScreenShell>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      marginBottom: 16,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.accent,
      marginBottom: 8,
    },
    helperText: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 10,
    },
    inputGroup: {
      marginTop: 8,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      marginBottom: 10,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontWeight: '600',
      fontSize: 14,
    },
    secondaryButton: {
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    secondaryButtonTight: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
    },
    secondaryButtonText: {
      color: colors.accent,
      fontWeight: '600',
      fontSize: 14,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    houseList: {
      marginTop: 8,
    },
    houseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    houseRowText: {
      flex: 1,
      paddingRight: 12,
    },
    houseRowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    houseRowSubtitle: {
      fontSize: 12,
      color: colors.muted,
    },
    houseRowActions: {
      flexDirection: 'row',
    },
    linkButton: {
      marginLeft: 10,
    },
    linkButtonText: {
      color: colors.accent,
      fontWeight: '600',
      fontSize: 12,
    },
  });
