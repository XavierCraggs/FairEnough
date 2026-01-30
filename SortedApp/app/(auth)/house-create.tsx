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
import houseService from '@/services/houseService';
import authService from '@/services/authService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { selectionChanged } from '@/utils/haptics';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/api/firebase';

const EMOJI_OPTIONS = ['🏠', '🏡', '🏘️', '🏢', '🏬', '🏭', '🏰', '🏯', '🏫', '🏨', '🍆', '🌶️'];

export default function HouseCreateScreen() {
  const { user, userProfile } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [houseName, setHouseName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [avoidRepeats, setAvoidRepeats] = useState(true);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = houseName.trim().length > 0;

  const handleNext = () => {
    if (step === 1 && !canContinue) {
      setError('House name is required.');
      return;
    }
    selectionChanged();
    setError(null);
    setStep((prev) => (prev === 1 ? 2 : 3));
  };

  const handleBack = () => {
    if (step === 1) {
      router.back();
      return;
    }
    setError(null);
    setStep((prev) => (prev === 3 ? 2 : 1));
  };

  const handleCreate = async () => {
    if (!user) {
      setError('You must be signed in to create a house.');
      return;
    }
    if (!canContinue) {
      setError('House name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const displayName = emoji ? `${emoji} ${houseName.trim()}` : houseName.trim();
      const house = await houseService.createHouse(user.uid, displayName);
      await houseService.updateHousePreferences(house.houseId, user.uid, {
        choreRotationAvoidRepeat: avoidRepeats,
        choreDensity: density,
      });
      await setDoc(
        doc(db, 'users', user.uid),
        { onboardingStep: 'quick-start', updatedAt: serverTimestamp() },
        { merge: true }
      );
      // Navigation handled by AuthContext once profile updates.
    } catch (err: any) {
      setError(err?.message || 'Unable to create house right now.');
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <FontAwesome name="chevron-left" size={16} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.stepper}>
          {[1, 2, 3].map((value) => (
            <View
              key={value}
              style={[
                styles.stepDot,
                value === step && styles.stepDotActive,
              ]}
            />
          ))}
        </View>

        {step === 1 && (
          <>
            <Text style={styles.title}>Name your house</Text>
            <Text style={styles.subtitle}>
              Give your household a name everyone recognizes.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="House name"
              placeholderTextColor={colors.muted}
              value={houseName}
              onChangeText={(text) => {
                setHouseName(text);
                setError(null);
              }}
              autoCapitalize="words"
              editable={!loading}
            />

            <Text style={styles.label}>Pick an emoji (optional)</Text>
            <View style={styles.emojiRow}>
              {EMOJI_OPTIONS.map((option) => {
                const active = emoji === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.emojiChip, active && styles.emojiChipActive]}
                    onPress={() => setEmoji(option)}
                  >
                    <Text style={styles.emojiText}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Chore defaults</Text>
            <Text style={styles.subtitle}>
              Set the default layout and fairness for your house.
            </Text>

            <Text style={styles.label}>Avoid repeats</Text>
            <View style={styles.toggleRow}>
              {[true, false].map((value) => {
                const active = avoidRepeats === value;
                return (
                  <TouchableOpacity
                    key={value ? 'avoid' : 'allow'}
                    style={[styles.toggleChip, active && styles.toggleChipActive]}
                    onPress={() => setAvoidRepeats(value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        active && styles.toggleTextActive,
                      ]}
                    >
                      {value ? 'Avoid repeats' : 'Allow repeats'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              Avoid repeats skips whoever did the chore last time and rotates to someone else first.
            </Text>

            <Text style={styles.label}>Chore layout</Text>
            <View style={styles.toggleRow}>
              {(['comfortable', 'compact'] as const).map((value) => {
                const active = density === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.toggleChip, active && styles.toggleChipActive]}
                    onPress={() => setDensity(value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        active && styles.toggleTextActive,
                      ]}
                    >
                      {value === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              Comfortable shows full details by default. Compact shows a tighter list with details tucked away.
            </Text>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Ready to invite</Text>
            <Text style={styles.subtitle}>
              You can invite housemates right after creating the house. We’ll show
              the invite code in Settings.
            </Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>House summary</Text>
              <Text style={styles.summaryLine}>
                {emoji ? `${emoji} ` : ''}
                {houseName.trim() || 'Unnamed house'}
              </Text>
              <Text style={styles.summaryMeta}>
                Layout: {density === 'comfortable' ? 'Comfortable' : 'Compact'}
              </Text>
              <Text style={styles.summaryMeta}>
                Rotation: {avoidRepeats ? 'Avoid repeats' : 'Allow repeats'}
              </Text>
            </View>
          </>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.footer}>
          {step < 3 ? (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>Create house</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.exitButton}
            onPress={handleExitSetup}
            disabled={loading}
          >
            <Text style={styles.exitButtonText}>Back to welcome</Text>
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
      paddingTop: 64,
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
      marginBottom: 20,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 24,
    },
    stepDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    stepDotActive: {
      backgroundColor: colors.accent,
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
    helperText: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 6,
      marginBottom: 16,
      lineHeight: 18,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
      marginBottom: 8,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      marginBottom: 18,
    },
    emojiRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    emojiChip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    emojiText: {
      fontSize: 18,
    },
    toggleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    toggleChip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    toggleChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    toggleTextActive: {
      color: colors.onAccent,
    },
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginTop: 8,
    },
    summaryTitle: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 8,
      fontWeight: '600',
    },
    summaryLine: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: 6,
    },
    summaryMeta: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 4,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      marginTop: 8,
    },
    footer: {
      marginTop: 'auto',
      paddingBottom: 32,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
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
      marginTop: 12,
      alignItems: 'center',
    },
    exitButtonText: {
      fontSize: 13,
      color: colors.muted,
      textDecorationLine: 'underline',
    },
  });
