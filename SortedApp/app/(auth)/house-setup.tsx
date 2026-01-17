import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/contexts/AuthContext';
import houseService, { HouseServiceError, HouseServiceErrorCode } from '@/services/houseService';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function HouseSetupScreen() {
  const { user, userProfile } = useAuth();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [houseName, setHouseName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateHouse = async () => {
    if (!houseName.trim()) {
      setError('House name is required');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a house');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await houseService.createHouse(user.uid, houseName);
      // Navigation will be handled by AuthContext when userProfile updates
      setCreateModalVisible(false);
      setHouseName('');
    } catch (err) {
      const houseError = err as HouseServiceError;
      setError(getErrorMessage(houseError.code));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHouse = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length !== 6) {
      setError('Please enter a valid 6-character invite code');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to join a house');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await houseService.joinHouse(user.uid, inviteCode);
      // Navigation will be handled by AuthContext when userProfile updates
      setJoinModalVisible(false);
      setInviteCode('');
    } catch (err) {
      const houseError = err as HouseServiceError;
      setError(getErrorMessage(houseError.code));
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (code: HouseServiceErrorCode): string => {
    switch (code) {
      case HouseServiceErrorCode.INVALID_CODE:
        return 'Invalid invite code. Please check and try again.';
      case HouseServiceErrorCode.HOUSE_FULL:
        return 'This house is full (8 members max). Ask the house admin to upgrade to Premium.';
      case HouseServiceErrorCode.ALREADY_IN_HOUSE:
        return 'You are already in a house.';
      default:
        return 'An error occurred. Please try again.';
    }
  };

  const handleInviteCodeChange = (text: string) => {
    // Auto-uppercase and limit to 6 characters
    const upperText = text.toUpperCase().slice(0, 6);
    setInviteCode(upperText);
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
          <Text style={styles.title}>Welcome to Sorted</Text>
          <Text style={styles.subtitle}>Let's get your house organized</Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setCreateModalVisible(true)}
              disabled={loading}
            >
              <FontAwesome name="home" size={24} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.primaryButtonText}>Start a New House</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setJoinModalVisible(true)}
              disabled={loading}
            >
              <FontAwesome name="key" size={24} color={BUTLER_BLUE} style={styles.buttonIcon} />
              <Text style={styles.secondaryButtonText}>I have an Invite Code</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.alfredContainer}>
            <View style={styles.alfredBubble}>
              <Text style={styles.alfredText}>Alfred is ready to organize your new home.</Text>
            </View>
            <FontAwesome name="user" size={20} color={BUTLER_BLUE} style={styles.alfredIcon} />
          </View>
        </View>
      </ScrollView>

      {/* Create House Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCreateModalVisible(false);
          setHouseName('');
          setError(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <View style={styles.modalCard} lightColor="#FFFFFF" darkColor="#FFFFFF">
              <Text style={styles.modalTitle}>Create New House</Text>
              <Text style={styles.modalSubtitle}>Give your house a name</Text>

              <TextInput
                style={styles.modalInput}
                placeholder="House Name"
                placeholderTextColor="#9CA3AF"
                value={houseName}
                onChangeText={(text) => {
                  setHouseName(text);
                  setError(null);
                }}
                autoCapitalize="words"
                autoFocus
                editable={!loading}
              />

              {error && <Text style={styles.modalErrorText}>{error}</Text>}

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    setCreateModalVisible(false);
                    setHouseName('');
                    setError(null);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton, loading && styles.buttonDisabled]}
                  onPress={handleCreateHouse}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Join House Modal */}
      <Modal
        visible={joinModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setJoinModalVisible(false);
          setInviteCode('');
          setError(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <View style={styles.modalCard} lightColor="#FFFFFF" darkColor="#FFFFFF">
              <Text style={styles.modalTitle}>Join House</Text>
              <Text style={styles.modalSubtitle}>Enter your 6-character invite code</Text>

              <TextInput
                style={[styles.modalInput, styles.inviteCodeInput]}
                placeholder="ABC123"
                placeholderTextColor="#9CA3AF"
                value={inviteCode}
                onChangeText={handleInviteCodeChange}
                autoCapitalize="characters"
                maxLength={6}
                autoFocus
                editable={!loading}
              />

              {error && <Text style={styles.modalErrorText}>{error}</Text>}

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    setJoinModalVisible(false);
                    setInviteCode('');
                    setError(null);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton, loading && styles.buttonDisabled]}
                  onPress={handleJoinHouse}
                  disabled={loading || inviteCode.length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Join</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 48,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 48,
  },
  primaryButton: {
    backgroundColor: BUTLER_BLUE,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BUTLER_BLUE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonIcon: {
    marginRight: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: BUTLER_BLUE,
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  alfredContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  alfredBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: '75%',
  },
  alfredText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  alfredIcon: {
    opacity: 0.7,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inviteCodeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 4,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalErrorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F3F4F6',
  },
  modalConfirmButton: {
    backgroundColor: BUTLER_BLUE,
  },
  modalCancelText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

