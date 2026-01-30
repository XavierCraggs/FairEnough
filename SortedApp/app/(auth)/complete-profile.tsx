import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View as RNView,
  Alert,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import authService from '@/services/authService';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/api/firebase';
import { router } from 'expo-router';

export default function CompleteProfileScreen() {
  const { user, userProfile } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(userProfile?.name || '');
  const [saving, setSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState(
    userProfile?.phone || user?.phoneNumber || ''
  );
  const [intent, setIntent] = useState<'chores' | 'bills' | 'both'>(
    userProfile?.onboardingIntent || 'both'
  );
  const providerLabel = useMemo(() => {
    const providerId =
      user?.providerData?.find((provider) => provider.providerId !== 'firebase')?.providerId ||
      user?.providerData?.[0]?.providerId ||
      'password';
    switch (providerId) {
      case 'google.com':
        return 'Google';
      case 'apple.com':
        return 'Apple';
      case 'facebook.com':
        return 'Facebook';
      case 'password':
        return 'Email/password';
      default:
        return providerId;
    }
  }, [user?.providerData]);
  const emailLabel = user?.email || 'Unknown';

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Profile', 'You must be signed in to continue.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Profile', 'Please add your name.');
      return;
    }

    setSaving(true);
    try {
      await authService.updateUserName(trimmedName);
      await setDoc(
        doc(db, 'users', user.uid),
        {
          profileIncomplete: false,
          phone: phoneInput.trim() || null,
          onboardingIntent: intent,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error: any) {
      Alert.alert('Profile', error?.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
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
        <Text style={styles.title}>Complete your profile</Text>
        <Text style={styles.subtitle}>
          Add a name so your housemates know who you are.
        </Text>
        <View style={styles.authInfo}>
          <Text style={styles.authInfoLabel}>Signed in as</Text>
          <Text style={styles.authInfoValue}>{emailLabel}</Text>
          <Text style={styles.authInfoLabel}>Sign-in method</Text>
          <Text style={styles.authInfoValue}>{providerLabel}</Text>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          editable={!saving}
        />

        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={colors.muted}
          value={phoneInput}
          onChangeText={setPhoneInput}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!saving}
        />

        <Text style={styles.label}>Use FairEnough for</Text>
        <RNView style={styles.intentRow}>
          {(['chores', 'bills', 'both'] as const).map((value) => {
            const active = intent === value;
            const label =
              value === 'chores' ? 'Chores' : value === 'bills' ? 'Bills' : 'Both';
            return (
              <TouchableOpacity
                key={value}
                style={[styles.intentChip, active && styles.intentChipActive]}
                onPress={() => setIntent(value)}
                disabled={saving}
              >
                <Text style={[styles.intentText, active && styles.intentTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </RNView>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryButtonText}>Save and continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exitButton}
          onPress={handleExitSetup}
          disabled={saving}
        >
          <Text style={styles.exitButtonText}>Back to welcome</Text>
        </TouchableOpacity>
      </View>
      <RNView />
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
      paddingTop: 80,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 10,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 20,
    },
    authInfo: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
    },
    authInfoLabel: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 4,
      fontWeight: '600',
    },
    authInfoValue: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 10,
    },
    label: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 8,
      fontWeight: '600',
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.card,
      marginBottom: 16,
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
    intentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    intentChip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    intentChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    intentText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    intentTextActive: {
      color: colors.onAccent,
    },
  });
