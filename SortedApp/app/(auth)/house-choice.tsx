import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuth } from '@/contexts/AuthContext';
import { AppTheme } from '@/constants/AppColors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import authService from '@/services/authService';

export default function HouseChoiceScreen() {
  const { userProfile } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(auth)/complete-profile')}>
        <FontAwesome name="chevron-left" size={16} color={colors.accent} />
      </TouchableOpacity>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FontAwesome name="home" size={26} color={colors.accent} />
        </View>
        <Text style={styles.title}>Choose your house</Text>
        <Text style={styles.subtitle}>
          Join an existing house with a code or create a new one.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join a house</Text>
        <Text style={styles.cardBody}>
          You already have an invite code from a housemate.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, styles.primaryButtonCompact]}
          onPress={() => router.push('/(auth)/house-join')}
        >
          <FontAwesome name="key" size={16} color={colors.onAccent} />
          <Text style={styles.primaryButtonText}>Enter invite code</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create a new house</Text>
        <Text style={styles.cardBody}>
          Set up a brand new house and invite others.
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/house-create')}
        >
          <FontAwesome name="plus" size={16} color={colors.accent} />
          <Text style={styles.secondaryButtonText}>Start a house</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.editProfileButton}
        onPress={() => router.push('/(auth)/complete-profile')}
      >
        <Text style={styles.editProfileText}>Edit profile details</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.exitButton} onPress={handleExitSetup}>
        <Text style={styles.exitButtonText}>Back to welcome</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 72,
      paddingBottom: 40,
      backgroundColor: colors.background,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 32,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      alignSelf: 'flex-start',
    },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 6,
    },
    cardBody: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 16,
      lineHeight: 18,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primaryButtonCompact: {
      alignSelf: 'flex-start',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 8,
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    secondaryButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 8,
    },
    editProfileButton: {
      alignSelf: 'center',
      marginTop: 8,
    },
    editProfileText: {
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'underline',
    },
    exitButton: {
      alignSelf: 'center',
      marginTop: 10,
    },
    exitButtonText: {
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'underline',
    },
  });
