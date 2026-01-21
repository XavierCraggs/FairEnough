import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';

export default function ResetPasswordScreen() {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authService.resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      const authError = err as AuthServiceError;
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={18} color={colors.accent} />
        </Pressable>

        <View style={styles.logoCircle}>
          <FontAwesome name="lock" size={22} color={colors.accent} />
        </View>

        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we will send you a reset link.
        </Text>

        <Text style={styles.inputLabel}>Email</Text>
        <View style={styles.inputRow}>
          <FontAwesome name="envelope" size={14} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.buttonText}>
              {sent ? 'Resend link' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>

        {sent && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Email sent</Text>
            <Text style={styles.successText}>
              Check your inbox for the reset link. You can resend if needed.
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: 32,
      paddingTop: 48,
      paddingBottom: 40,
      justifyContent: 'flex-start',
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
    logoCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
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
      marginBottom: 24,
    },
    inputLabel: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 6,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      marginLeft: 10,
      padding: 0,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      marginBottom: 12,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
    successCard: {
      marginTop: 20,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.successSoft,
    },
    successTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.success,
      marginBottom: 6,
    },
    successText: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
  });
