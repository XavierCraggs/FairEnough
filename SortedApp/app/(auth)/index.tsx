import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Text } from '@/components/Themed';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import Constants from 'expo-constants';
import authService, { AuthServiceError } from '@/services/authService';

WebBrowser.maybeCompleteAuthSession();

export default function AuthWelcomeScreen() {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [authLoading, setAuthLoading] = useState(false);
  const googleWebClientId = Constants.expoConfig?.extra?.googleWebClientId ?? '';
  const googleAndroidClientId =
    Constants.expoConfig?.extra?.googleAndroidClientId ?? '';
  const googleIosClientId = Constants.expoConfig?.extra?.googleIosClientId ?? '';
  const googleExpoClientId = Constants.expoConfig?.extra?.googleExpoClientId ?? '';
  const facebookAppId = Constants.expoConfig?.extra?.facebookAppId ?? '';

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId,
    androidClientId: googleAndroidClientId || undefined,
    iosClientId: googleIosClientId || undefined,
    expoClientId: googleExpoClientId || undefined,
    responseType: 'id_token',
    scopes: ['profile', 'email'],
    prompt: 'select_account',
  });

  const [facebookRequest, facebookResponse, facebookPromptAsync] = Facebook.useAuthRequest({
    clientId: facebookAppId || '',
    responseType: 'token',
    scopes: ['public_profile', 'email'],
  });

  useEffect(() => {
    const handleGoogleResponse = async () => {
      if (googleResponse?.type !== 'success') return;
      const idToken = googleResponse.params?.id_token;
      if (!idToken) {
        Alert.alert('Sorted', 'Unable to sign in with Google right now.');
        return;
      }

      try {
        setAuthLoading(true);
        await authService.signInWithGoogle(idToken);
      } catch (err) {
        const authError = err as AuthServiceError;
        Alert.alert('Sorted', authError.message);
      } finally {
        setAuthLoading(false);
      }
    };

    handleGoogleResponse();
  }, [googleResponse]);

  useEffect(() => {
    const handleFacebookResponse = async () => {
      if (facebookResponse?.type !== 'success') return;
      const accessToken = facebookResponse.params?.access_token;
      if (!accessToken) {
        Alert.alert('Sorted', 'Unable to sign in with Facebook right now.');
        return;
      }

      try {
        setAuthLoading(true);
        await authService.signInWithFacebook(accessToken);
      } catch (err) {
        const authError = err as AuthServiceError;
        Alert.alert('Sorted', authError.message);
      } finally {
        setAuthLoading(false);
      }
    };

    handleFacebookResponse();
  }, [facebookResponse]);

  const handleGooglePress = async () => {
    const needsAndroidId = Platform.OS === 'android';
    const needsIosId = Platform.OS === 'ios';
    const hasAndroidId = !!googleAndroidClientId;
    const hasIosId = !!googleIosClientId;
    const hasAnyId =
      !!googleWebClientId || hasAndroidId || hasIosId || !!googleExpoClientId;

    if (!hasAnyId) {
      Alert.alert('Sorted', 'Google sign-in is not configured yet.');
      return;
    }
    if (needsAndroidId && !hasAndroidId) {
      Alert.alert('Sorted', 'Missing Android Google client ID.');
      return;
    }
    if (needsIosId && !hasIosId) {
      Alert.alert('Sorted', 'Missing iOS Google client ID.');
      return;
    }
    if (!googleRequest) {
      Alert.alert('Sorted', 'Google sign-in is unavailable right now.');
      return;
    }
    await googlePromptAsync({ useProxy: false });
  };

  const handleFacebookPress = async () => {
    if (!facebookAppId) {
      Alert.alert('Sorted', 'Facebook sign-in needs an App ID first.');
      return;
    }
    if (!facebookRequest) {
      Alert.alert('Sorted', 'Facebook sign-in is unavailable right now.');
      return;
    }
    await facebookPromptAsync({ useProxy: false });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.logoCircle}>
        <FontAwesome name="home" size={26} color={colors.accent} />
      </View>

      <Text style={styles.title}>Let's get started!</Text>
      <Text style={styles.subtitle}>
        Sorted keeps sharehouse chores and bills calm, fair, and simple.
      </Text>

      <View style={styles.socialGroup}>
        <TouchableOpacity
          style={[styles.socialButton, authLoading && styles.buttonDisabled]}
          onPress={handleGooglePress}
          disabled={authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <FontAwesome name="google" size={16} color={colors.accent} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.socialButton, authLoading && styles.buttonDisabled]}
          onPress={handleFacebookPress}
          disabled={authLoading}
        >
          <FontAwesome name="facebook" size={18} color={colors.accent} />
          <Text style={styles.socialText}>Continue with Facebook</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/(auth)/register')}
        disabled={authLoading}
      >
        <Text style={styles.primaryButtonText}>Sign up</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push('/(auth)/login')}
        disabled={authLoading}
      >
        <Text style={styles.secondaryButtonText}>Log in</Text>
      </TouchableOpacity>

      <Text style={styles.termsText}>
        By continuing, you agree to Sorted's Privacy Policy and Terms.
      </Text>
    </ScrollView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: 32,
      paddingTop: 72,
      paddingBottom: 40,
      backgroundColor: colors.background,
      alignItems: 'center',
    },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
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
    socialGroup: {
      width: '100%',
      marginBottom: 24,
    },
    socialButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      marginBottom: 12,
      backgroundColor: colors.card,
    },
    socialText: {
      marginLeft: 10,
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    primaryButton: {
      width: '100%',
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryButton: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: 'transparent',
      marginBottom: 20,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    secondaryButtonText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
    },
    termsText: {
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
  });
