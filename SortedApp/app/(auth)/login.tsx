import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function LoginScreen() {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authService.signIn(email, password);
      // Navigation will be handled by auth state listener
      router.replace('/(tabs)');
    } catch (err) {
      const authError = err as AuthServiceError;
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/(auth)/reset-password');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content} lightColor={colors.background} darkColor={colors.background}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={18} color={colors.accent} />
        </Pressable>

        <View style={styles.logoCircle}>
          <FontAwesome name="home" size={22} color={colors.accent} />
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Please enter your email & password to sign in.
        </Text>

        <View style={styles.form}>
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

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputRow}>
            <FontAwesome name="lock" size={16} color={colors.muted} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.rowBetween}>
            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberMe((value) => !value)}
            >
              <View
                style={[
                  styles.checkbox,
                  rememberMe && styles.checkboxActive,
                ]}
              >
                {rememberMe && (
                  <FontAwesome name="check" size={10} color={colors.onAccent} />
                )}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </Pressable>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} disabled={loading}>
            <Text style={styles.linkText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: 48,
    paddingBottom: 40,
    justifyContent: 'flex-start',
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
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 28,
  },
  form: {
    width: '100%',
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
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
    fontSize: 14,
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: colors.surface,
  },
  checkboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rememberText: {
    fontSize: 13,
    color: colors.muted,
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
    fontSize: 16,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'center',
  },
  forgotText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  });


