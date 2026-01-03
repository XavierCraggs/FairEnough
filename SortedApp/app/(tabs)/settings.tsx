import { StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import authService, { AuthServiceError } from '@/services/authService';
import { useState } from 'react';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);

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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.title}>Settings</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>House Invite Code</Text>
          <Text style={styles.description}>
            Share your house invite code with new members to join your shared house.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Settings</Text>
          <Text style={styles.description}>
            Manage your profile, preferences, and account settings.
          </Text>
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

