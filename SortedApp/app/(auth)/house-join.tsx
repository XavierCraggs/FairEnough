import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import { useAuth } from '@/contexts/AuthContext';
import houseService, { HouseServiceError, HouseServiceErrorCode } from '@/services/houseService';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/api/firebase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import authService from '@/services/authService';

export default function HouseJoinScreen() {
  const { user, userProfile } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInviteCodeChange = (text: string) => {
    const upperText = text.toUpperCase().slice(0, 6);
    setInviteCode(upperText);
    setError(null);
  };

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length !== 6) {
      setError('Please enter a valid 6-character invite code');
      return;
    }
    if (!user) {
      setError('You must be signed in to join a house.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await houseService.joinHouse(user.uid, inviteCode);
      await setDoc(
        doc(db, 'users', user.uid),
        { onboardingStep: 'quick-start', updatedAt: serverTimestamp() },
        { merge: true }
      );
      // Navigation handled by AuthContext once profile updates
    } catch (err) {
      const houseError = err as HouseServiceError;
      switch (houseError.code) {
        case HouseServiceErrorCode.INVALID_CODE:
          setError('Invalid invite code. Please check and try again.');
          break;
        case HouseServiceErrorCode.HOUSE_FULL:
          setError('This house is full (8 members max). Ask the admin to upgrade.');
          break;
        case HouseServiceErrorCode.ALREADY_IN_HOUSE:
          setError('You are already in a house.');
          break;
        default:
          setError('Unable to join right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExitSetup = async () => {
    try {
      if (!userProfile?.houseId) {
        await authService.deleteAccount();
      } else {
        await authService.signOut();
      }
    } catch {
      // ignore
    } finally {
      router.replace('/(auth)');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content} lightColor={colors.background} darkColor={colors.background}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.heroIcon}>
          <FontAwesome name="key" size={22} color={colors.accent} />
        </View>

        <Text style={styles.title}>Join a house</Text>
        <Text style={styles.subtitle}>
          Enter the 6-character code shared by your housemate.
        </Text>

        <TextInput
          style={styles.codeInput}
          placeholder="ABC123"
          placeholderTextColor={colors.muted}
          value={inviteCode}
          onChangeText={handleInviteCodeChange}
          autoCapitalize="characters"
          maxLength={6}
          editable={!loading}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={loading || inviteCode.length !== 6}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryButtonText}>Join house</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exitButton}
          onPress={handleExitSetup}
          disabled={loading}
        >
          <Text style={styles.exitButtonText}>Back to welcome</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: 32,
      paddingTop: 72,
      backgroundColor: colors.background,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      marginBottom: 24,
      lineHeight: 20,
    },
    codeInput: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 24,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 4,
      color: colors.text,
      marginBottom: 12,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    exitButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    exitButtonText: {
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'underline',
    },
  });
