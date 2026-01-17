import { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TextInput,
  TouchableWithoutFeedback,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import houseService, { HouseData } from '@/services/houseService';
import choreService from '@/services/choreService';
import notificationService from '@/services/notificationService';
import useAlfred from '@/hooks/useAlfred';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/api/firebase';
import * as Clipboard from 'expo-clipboard';
import FontAwesome from '@expo/vector-icons/FontAwesome';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';
const MUTED_TEXT = '#6B7280';

interface Member {
  userId: string;
  name: string;
  totalPoints: number;
}

interface FairnessData {
  averagePoints: number;
  memberStats: Array<{
    userId: string;
    userName: string;
    totalPoints: number;
    deviation: number;
  }>;
}

export default function DashboardScreen() {
  const { userProfile, user } = useAuth();
  const userName = userProfile?.name || 'User';
  const houseId = userProfile?.houseId;
  const currentUserId = user?.uid;

  const [houseData, setHouseData] = useState<HouseData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [fairnessData, setFairnessData] = useState<FairnessData | null>(null);
  const [loadingHouse, setLoadingHouse] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingFairness, setLoadingFairness] = useState(true);
  const [alfredModalVisible, setAlfredModalVisible] = useState(false);
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [nudgeInput, setNudgeInput] = useState('');
  const [nudgeSubmitting, setNudgeSubmitting] = useState(false);

  const {
    notifications,
    latestNotification,
    unreadNotifications,
    markAsRead,
    getNextUnreadToast,
  } = useAlfred({
    houseId: houseId ?? null,
    userId: currentUserId ?? null,
  });

  // Fetch house data
  useEffect(() => {
    if (!houseId) {
      setLoadingHouse(false);
      return;
    }

    const fetchHouse = async () => {
      try {
        const house = await houseService.getHouse(houseId);
        setHouseData(house);
      } catch (error) {
        console.error('Error fetching house:', error);
        Alert.alert('Error', 'Failed to load house data');
      } finally {
        setLoadingHouse(false);
      }
    };

    fetchHouse();
  }, [houseId]);

  // Real-time members subscription
  useEffect(() => {
    if (!houseId) {
      setLoadingMembers(false);
      return;
    }

    setLoadingMembers(true);
    const membersQuery = query(
      collection(db, 'users'),
      where('houseId', '==', houseId)
    );

    const unsubscribe = onSnapshot(
      membersQuery,
      (snapshot) => {
        const membersList: Member[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            userId: doc.id,
            name: data.name || 'Unknown',
            totalPoints: data.totalPoints || 0,
          };
        });
        setMembers(membersList);
        setLoadingMembers(false);
      },
      (error) => {
        console.error('Error fetching members:', error);
        setLoadingMembers(false);
      }
    );

    return unsubscribe;
  }, [houseId]);

  // Calculate fairness
  useEffect(() => {
    if (!houseId) {
      setLoadingFairness(false);
      return;
    }

    const calculateFairness = async () => {
      try {
        setLoadingFairness(true);
        const fairness = await choreService.calculateHouseFairness(houseId);
        setFairnessData(fairness);
      } catch (error) {
        console.error('Error calculating fairness:', error);
      } finally {
        setLoadingFairness(false);
      }
    };

    calculateFairness();
  }, [houseId, members]);

  const handleCopyInviteCode = async () => {
    if (!houseData?.inviteCode) return;

    try {
      await Clipboard.setStringAsync(houseData.inviteCode);
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy invite code');
    }
  };

  const handleAddChore = () => {
    router.push('/(tabs)/chores');
  };

  const handleOpenAlfredModal = () => {
    setAlfredModalVisible(true);
    unreadNotifications.forEach((notification) => {
      markAsRead(notification.notificationId);
    });
  };

  const handleSendNudge = async () => {
    if (!houseId || !currentUserId) return;
    if (!nudgeInput.trim()) {
      Alert.alert('Alfred', 'Please enter a short reminder.');
      return;
    }

    setNudgeSubmitting(true);
    try {
      await notificationService.sendAlfredNudge(houseId, currentUserId, 'NUDGE', {
        subject: nudgeInput.trim(),
      });
      setNudgeInput('');
      setNudgeModalVisible(false);
    } catch (error: any) {
      Alert.alert('Alfred', error?.message || 'Unable to send Alfred nudge.');
    } finally {
      setNudgeSubmitting(false);
    }
  };

  const handleLeaveHouse = () => {
    if (!houseId || !currentUserId) return;

    Alert.alert(
      'Leave House',
      'Are you sure you want to leave this house- This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await houseService.leaveHouse(currentUserId, houseId);
              router.replace('/(auth)/house-setup');
            } catch (error: any) {
              console.error('Error leaving house:', error);
              Alert.alert('Error', error.message || 'Failed to leave house');
            }
          },
        },
      ]
    );
  };

  const getCurrentUserDeviation = () => {
    if (!fairnessData || !currentUserId) return null;
    const currentUserStat = fairnessData.memberStats.find(
      (stat) => stat.userId === currentUserId
    );
    return currentUserStat?.deviation ?? null;
  };

  const formatNotificationTime = (createdAt: any) => {
    if (createdAt?.toDate) {
      return createdAt.toDate().toLocaleString();
    }
    return 'Just now';
  };

  const currentUserDeviation = getCurrentUserDeviation();
  const unreadCount = unreadNotifications.length;
  const latestNotificationTime = latestNotification
    ? formatNotificationTime(latestNotification.createdAt)
    : null;

  useEffect(() => {
    if (!houseId || !currentUserId) return;
    const nextToast = getNextUnreadToast();
    if (!nextToast) return;
    Alert.alert('Alfred', nextToast.message, [
      {
        text: 'Dismiss',
        onPress: () => markAsRead(nextToast.notificationId),
      },
    ]);
  }, [houseId, currentUserId, getNextUnreadToast, markAsRead]);

  // No house case
  if (!houseId) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
          <Text style={styles.greeting}>Welcome back, {userName}!</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>No House</Text>
            <Text style={styles.description}>
              You're not in a house yet. Join an existing house or create a new one to get started.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/(auth)/house-setup')}
            >
              <Text style={styles.primaryButtonText}>Set Up House</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
      <ScrollView>
        <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.greeting}>Welcome back, {userName}!</Text>

        {/* Alfred Briefing */}
          <View style={styles.alfredCard}>
            <RNView style={styles.alfredHeader}>
              <RNView style={styles.alfredTitleRow}>
                <RNView style={styles.alfredIcon}>
                <FontAwesome name="user" size={18} color={BUTLER_BLUE} />
                </RNView>
                <Text style={styles.alfredTitle}>Alfred Briefing</Text>
                {unreadCount > 0 && (
                  <RNView style={styles.alfredBadge}>
                    <Text style={styles.alfredBadgeText}>{unreadCount}</Text>
                  </RNView>
                )}
              </RNView>
              <TouchableOpacity onPress={handleOpenAlfredModal}>
                <Text style={styles.alfredLink}>See All</Text>
              </TouchableOpacity>
            </RNView>
            <Text style={styles.alfredMessage}>
              {latestNotification?.message || 'No Alfred updates yet. Keep the house humming.'}
            </Text>
            {latestNotificationTime && (
              <Text style={styles.alfredMeta}>Last update: {latestNotificationTime}</Text>
            )}
            <RNView style={styles.alfredActionsRow}>
              <TouchableOpacity
                style={styles.alfredButton}
                onPress={() => setNudgeModalVisible(true)}
              >
              <Text style={styles.alfredButtonText}>Request Nudge</Text>
            </TouchableOpacity>
          </RNView>
        </View>

        {/* House Information */}
        {loadingHouse ? (
          <View style={styles.section}>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : houseData ? (
          <View style={styles.section}>
            <Text style={styles.houseName}>{houseData.name}</Text>
            <RNView style={styles.inviteCodeContainer}>
              <Text style={styles.inviteCodeLabel}>Invite Code:</Text>
              <RNView style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeText}>{houseData.inviteCode}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyInviteCode}
                >
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </RNView>
            </RNView>
            <Text style={styles.memberCount}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </Text>
          </View>
        ) : null}

        {/* House Fairness Summary */}
        {loadingFairness ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : fairnessData && currentUserDeviation !== null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <Text style={styles.fairnessAverage}>
              Average: {Math.round(fairnessData.averagePoints)} points
            </Text>
            <RNView style={styles.fairnessStatus}>
              <Text
                style={[
                  styles.fairnessStatusText,
                  currentUserDeviation >= 0 ? styles.fairnessPositive : styles.fairnessNegative,
                ]}
              >
                {currentUserDeviation >= 0 ? 'Up' : 'Down'}{' '}
                {Math.abs(Math.round(currentUserDeviation))} points{' '}
                {currentUserDeviation >= 0 ? 'above' : 'behind'} average
              </Text>
            </RNView>
          </View>
        ) : null}

        {/* Members List */}
        {loadingMembers ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Members</Text>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Members</Text>
            {members.length === 0 ? (
              <Text style={styles.description}>No members found</Text>
            ) : (
              members.map((member) => (
                <RNView key={member.userId} style={styles.memberRow}>
                  <RNView style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.name}
                      {member.userId === currentUserId && (
                        <Text style={styles.youBadge}> (You)</Text>
                      )}
                    </Text>
                    <Text style={styles.memberPoints}>{member.totalPoints} points</Text>
                  </RNView>
                </RNView>
              ))
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleAddChore}>
            <Text style={styles.actionButtonText}>Add Chore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDanger]}
            onPress={handleLeaveHouse}
          >
            <Text style={[styles.actionButtonText, styles.actionButtonDangerText]}>
              Leave House
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>

    <Modal
      visible={alfredModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setAlfredModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <RNView style={styles.modalContent}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Alfred Briefing</Text>
              <TouchableOpacity onPress={() => setAlfredModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </RNView>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => setNudgeModalVisible(true)}
            >
              <Text style={styles.modalPrimaryButtonText}>Request a nudge</Text>
            </TouchableOpacity>
            <ScrollView style={styles.modalList}>
              {notifications.length === 0 ? (
                <Text style={styles.description}>No notifications yet.</Text>
              ) : (
                notifications.map((notification) => (
                  <RNView
                    key={notification.notificationId}
                    style={styles.notificationRow}
                  >
                    <Text style={styles.notificationMessage}>
                      {notification.message}
                    </Text>
                    <Text style={styles.notificationMeta}>
                      {notification.type} - {formatNotificationTime(notification.createdAt)}
                    </Text>
                  </RNView>
                ))
              )}
            </ScrollView>
          </RNView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>

    <Modal
      visible={nudgeModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setNudgeModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <RNView style={styles.modalContent}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ask Alfred</Text>
              <TouchableOpacity onPress={() => setNudgeModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </RNView>
            <Text style={styles.modalLabel}>What should Alfred remind the house-</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., the dishes tonight"
              placeholderTextColor={MUTED_TEXT}
              value={nudgeInput}
              onChangeText={setNudgeInput}
            />
            <RNView style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.modalActionButton]}
                onPress={() => setNudgeModalVisible(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, nudgeSubmitting && styles.buttonDisabled]}
                onPress={handleSendNudge}
                disabled={nudgeSubmitting}
              >
                {nudgeSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Send nudge</Text>
                )}
              </TouchableOpacity>
            </RNView>
          </RNView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
    </View>
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
  greeting: {
    fontSize: 28,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 32,
  },
  alfredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alfredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alfredTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alfredBadge: {
    backgroundColor: '#E11D48',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  alfredBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  alfredIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E5EAF0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  alfredTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
  },
  alfredLink: {
    fontSize: 13,
    color: BUTLER_BLUE,
    fontWeight: '600',
  },
  alfredMessage: {
    fontSize: 14,
    color: MUTED_TEXT,
    lineHeight: 20,
  },
  alfredMeta: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 6,
  },
  alfredActionsRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  alfredButton: {
    backgroundColor: BUTLER_BLUE,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  alfredButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 20,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: MUTED_TEXT,
    lineHeight: 24,
    marginBottom: 16,
  },
  houseName: {
    fontSize: 24,
    fontWeight: '700',
    color: BUTLER_BLUE,
    marginBottom: 16,
  },
  inviteCodeContainer: {
    marginBottom: 12,
  },
  inviteCodeLabel: {
    fontSize: 14,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
    letterSpacing: 2,
  },
  copyButton: {
    backgroundColor: BUTLER_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  memberCount: {
    fontSize: 16,
    color: MUTED_TEXT,
  },
  fairnessAverage: {
    fontSize: 16,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  fairnessStatus: {
    marginTop: 8,
  },
  fairnessStatusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fairnessPositive: {
    color: '#16A34A',
  },
  fairnessNegative: {
    color: '#DC2626',
  },
  memberRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  memberInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: BUTLER_BLUE,
  },
  youBadge: {
    fontSize: 14,
    color: MUTED_TEXT,
    fontWeight: '400',
  },
  memberPoints: {
    fontSize: 16,
    color: MUTED_TEXT,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: BUTLER_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: BUTLER_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonDanger: {
    backgroundColor: '#DC2626',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonDangerText: {
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: BUTLER_BLUE,
  },
  modalCloseText: {
    fontSize: 14,
    color: MUTED_TEXT,
  },
  modalPrimaryButton: {
    backgroundColor: BUTLER_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalList: {
    maxHeight: 360,
  },
  notificationRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  notificationMessage: {
    fontSize: 14,
    color: BUTLER_BLUE,
    marginBottom: 4,
  },
  notificationMeta: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  modalLabel: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BUTLER_BLUE,
    backgroundColor: '#FFFFFF',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalActionButton: {
    flex: 1,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },
});
