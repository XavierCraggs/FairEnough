import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import { useAuth } from '@/contexts/AuthContext';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/api/firebase';
import * as Clipboard from 'expo-clipboard';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';

type QuickStep = 'chore' | 'bill' | 'event' | 'invite' | 'invite-copy' | 'invite-share';

export default function QuickStartScreen() {
  const { user, activeHouseId, setQuickStartBypass } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const houseId = activeHouseId ?? null;
  const [loading, setLoading] = useState<QuickStep | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Record<QuickStep, boolean>>({
    chore: false,
    bill: false,
    event: false,
    invite: false,
  });

  useEffect(() => {
    setQuickStartBypass(false);
  }, [setQuickStartBypass]);

  useEffect(() => {
    if (!houseId) return;
    const unsubscribe = onSnapshot(doc(db, 'houses', houseId), (snapshot) => {
      const data = snapshot.data() as any;
      setInviteCode(data?.inviteCode || null);
    });
    return () => unsubscribe();
  }, [houseId]);


  const finishQuickStart = async () => {
    if (!user?.uid) return;
    await setDoc(
      doc(db, 'users', user.uid),
      { onboardingStep: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setQuickStartBypass(false);
    router.replace('/(tabs)/');
  };

  const handleCreateChore = () => {
    setQuickStartBypass(true);
    router.push('/(tabs)/chores?openCreate=1&qs=chore');
  };

  const handleCreateBill = () => {
    setQuickStartBypass(true);
    router.push('/(tabs)/finance?openCreate=1&qs=bill');
  };

  const handleCreateEvent = () => {
    setQuickStartBypass(true);
    router.push('/(tabs)/calendar?openCreate=1&qs=event');
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    setLoading('invite-copy');
    try {
      await Clipboard.setStringAsync(inviteCode);
      setCompleted((prev) => ({ ...prev, invite: true }));
    } catch (error: any) {
      Alert.alert('Quick start', error?.message || 'Unable to copy invite code.');
    } finally {
      setLoading(null);
    }
  };

  const handleShareInvite = async () => {
    if (!inviteCode) return;
    setLoading('invite-share');
    try {
      await Share.share({
        message: `Join my FairEnough house with this invite code: ${inviteCode}`,
      });
    } catch (error: any) {
      Alert.alert('Quick start', error?.message || 'Unable to share invite code.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick start</Text>
        <Text style={styles.subtitle}>
          Get your first win in under two minutes.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a starter chore</Text>
        <Text style={styles.cardBody}>Create a weekly “Bins” chore.</Text>
        <TouchableOpacity
          style={[styles.actionButton, completed.chore && styles.actionButtonDone]}
            onPress={handleCreateChore}
            disabled={loading !== null}
          >
            <>
              <FontAwesome name="plus" size={14} color={colors.onAccent} />
              <Text style={styles.actionText}>Create chore</Text>
            </>
          </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a starter bill</Text>
        <Text style={styles.cardBody}>Split a $24 house supplies bill.</Text>
        <TouchableOpacity
          style={[styles.actionButton, completed.bill && styles.actionButtonDone]}
            onPress={handleCreateBill}
            disabled={loading !== null}
          >
            <>
              <FontAwesome name="plus" size={14} color={colors.onAccent} />
              <Text style={styles.actionText}>Create bill</Text>
            </>
          </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a reminder</Text>
        <Text style={styles.cardBody}>Create a recurring “Garbage night”.</Text>
        <TouchableOpacity
          style={[styles.actionButton, completed.event && styles.actionButtonDone]}
            onPress={handleCreateEvent}
            disabled={loading !== null}
          >
            <>
              <FontAwesome name="plus" size={14} color={colors.onAccent} />
              <Text style={styles.actionText}>Create reminder</Text>
            </>
          </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invite housemates</Text>
        <Text style={styles.cardBody}>
          Share your code with housemates so they can join.
        </Text>
        {inviteCode ? (
          <View style={styles.inviteCodePill}>
            <Text style={styles.inviteCodeText}>{inviteCode}</Text>
          </View>
        ) : (
          <Text style={styles.helperText}>Invite code will appear here.</Text>
        )}
        <View style={styles.inviteActions}>
          <TouchableOpacity
            style={[styles.actionButton, completed.invite && styles.actionButtonDone]}
            onPress={handleCopyInvite}
            disabled={loading !== null || !inviteCode}
          >
            {loading === 'invite-copy' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <FontAwesome
                  name={completed.invite ? 'check' : 'copy'}
                  size={14}
                  color={colors.onAccent}
                />
                <Text style={styles.actionText}>
                  {completed.invite ? 'Copied' : 'Copy'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={handleShareInvite}
            disabled={loading !== null || !inviteCode}
          >
            {loading === 'invite-share' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <FontAwesome name="share-alt" size={14} color={colors.onAccent} />
                <Text style={styles.actionText}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.finishButton} onPress={finishQuickStart}>
        <Text style={styles.finishButtonText}>
          Finish and go to dashboard
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 64,
      paddingBottom: 40,
      backgroundColor: colors.background,
    },
    header: {
      marginBottom: 24,
    },
    title: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 14,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 4,
    },
    cardBody: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 12,
    },
    helperText: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 12,
    },
    inviteCodePill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    inviteCodeText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.accent,
      letterSpacing: 2,
    },
    inviteActions: {
      flexDirection: 'row',
      gap: 10,
    },
    actionButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    actionButtonDone: {
      backgroundColor: colors.success,
    },
    actionButtonSecondary: {
      backgroundColor: colors.accentMuted,
    },
    actionText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '600',
      marginLeft: 8,
    },
    finishButton: {
      marginTop: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.accent,
      paddingVertical: 14,
      alignItems: 'center',
    },
    finishButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
  });
