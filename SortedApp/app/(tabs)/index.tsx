import { useEffect, useMemo, useState } from 'react';
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
  Pressable,
  Image,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import houseService, { HouseData } from '@/services/houseService';
import choreService, { ChoreData, ROLLING_WINDOW_DAYS } from '@/services/choreService';
import notificationService from '@/services/notificationService';
import useAlfred from '@/hooks/useAlfred';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/api/firebase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';

interface Member {
  userId: string;
  name: string;
  totalPoints: number;
  photoUrl?: string | null;
}

interface FairnessData {
  averagePoints: number;
  memberStats: Array<{
    userId: string;
    userName: string;
    totalPoints: number;
    deviation: number;
  }>;
  windowDays?: number;
}

export default function DashboardScreen() {
  const { userProfile, user } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userName = userProfile?.name || 'User';
  const houseId = userProfile?.houseId;
  const currentUserId = user?.uid;

  const [houseData, setHouseData] = useState<HouseData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [fairnessData, setFairnessData] = useState<FairnessData | null>(null);
  const [loadingHouse, setLoadingHouse] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingFairness, setLoadingFairness] = useState(true);
  const [loadingChores, setLoadingChores] = useState(true);
  const [choreSummary, setChoreSummary] = useState({
    totalOpen: 0,
    assignedToYou: 0,
    unassigned: 0,
    overdue: 0,
  });
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
            photoUrl: data.photoUrl || data.photoURL || null,
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

  const isChoreOverdue = (chore: ChoreData) => {
    if (chore.status === 'completed') {
      return false;
    }
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lastCompleted = chore.lastCompletedAt?.toDate
      ? chore.lastCompletedAt.toDate()
      : null;

    if (chore.frequency === 'daily') {
      return !lastCompleted || lastCompleted < startOfToday;
    }
    if (chore.frequency === 'weekly') {
      if (!lastCompleted) return true;
      const nextDue = new Date(lastCompleted);
      nextDue.setDate(nextDue.getDate() + 7);
      return nextDue < startOfToday;
    }
    if (chore.frequency === 'one-time') {
      return chore.status === 'pending';
    }
    return false;
  };

  // Real-time chore snapshot
  useEffect(() => {
    if (!houseId) {
      setLoadingChores(false);
      return;
    }

    setLoadingChores(true);
    const unsubscribe = choreService.subscribeToHouseChores(houseId, (chores) => {
      const openChores = chores.filter((chore) => chore.status !== 'completed');
      const assignedToYou = currentUserId
        ? openChores.filter((chore) => chore.assignedTo === currentUserId).length
        : 0;
      const unassigned = openChores.filter((chore) => !chore.assignedTo).length;
      const overdue = openChores.filter((chore) => isChoreOverdue(chore)).length;

      setChoreSummary({
        totalOpen: openChores.length,
        assignedToYou,
        unassigned,
        overdue,
      });
      setLoadingChores(false);
    });

    return () => unsubscribe();
  }, [houseId, currentUserId]);

  const handleOpenChores = () => {
    router.push('/(tabs)/chores');
  };

  const handleOpenSettings = () => {
    router.push('/(tabs)/settings');
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

  const sortedFairnessStats = useMemo(() => {
    if (!fairnessData?.memberStats?.length) {
      return [];
    }
    return [...fairnessData.memberStats].sort((a, b) => b.totalPoints - a.totalPoints);
  }, [fairnessData]);

  const memberPhotoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    members.forEach((member) => {
      map.set(member.userId, member.photoUrl ?? null);
    });
    return map;
  }, [members]);

  const currentUserStat = useMemo(() => {
    if (!fairnessData || !currentUserId) return null;
    return fairnessData.memberStats.find((stat) => stat.userId === currentUserId) || null;
  }, [fairnessData, currentUserId]);

  const fairnessRange = useMemo(() => {
    if (!fairnessData?.memberStats?.length) {
      return null;
    }
    const points = fairnessData.memberStats.map((stat) => stat.totalPoints);
    const minPoints = Math.min(...points);
    const maxPoints = Math.max(...points);
    const spread = Math.max(1, maxPoints - minPoints);
    const padding = Math.max(3, spread * 0.2);
    return {
      min: minPoints - padding,
      max: maxPoints + padding,
      average: fairnessData.averagePoints,
    };
  }, [fairnessData]);

  const getFairnessPosition = (points: number) => {
    if (!fairnessRange) return 0.5;
    const range = fairnessRange.max - fairnessRange.min;
    if (range <= 0) return 0.5;
    const clamped = Math.min(fairnessRange.max, Math.max(fairnessRange.min, points));
    return (clamped - fairnessRange.min) / range;
  };

  const formatNotificationTime = (createdAt: any) => {
    if (createdAt?.toDate) {
      return createdAt.toDate().toLocaleString();
    }
    return 'Just now';
  };

  const getFallbackColor = (userId: string) => {
    const palette = [
      colors.accent,
      colors.accentMuted,
      colors.success,
      colors.warning,
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
      hash = (hash * 31 + userId.charCodeAt(i)) % palette.length;
    }
    return palette[hash];
  };

  const getInitial = (name: string) => (name.trim() ? name.trim()[0].toUpperCase() : '?');

  const currentUserDeviation = currentUserStat?.deviation ?? null;
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
        <View style={styles.content} lightColor={colors.background} darkColor={colors.background}>
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
    <View style={styles.container} lightColor={colors.background} darkColor={colors.background}>
      <ScrollView>
        <View style={styles.content} lightColor={colors.background} darkColor={colors.background}>
        <Text style={styles.greeting}>Welcome back, {userName}!</Text>

        {/* Alfred Briefing */}
          <View style={styles.alfredCard}>
            <RNView style={styles.alfredHeader}>
              <RNView style={styles.alfredTitleRow}>
                <RNView style={styles.alfredIcon}>
                <FontAwesome name="user" size={18} color={colors.accent} />
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

        {/* House Snapshot */}
        {loadingHouse ? (
          <View style={styles.section}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : houseData ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Snapshot</Text>
            <Text style={styles.houseName}>{houseData.name}</Text>
            <Text style={styles.memberCount}>
              {loadingMembers
                ? 'Loading members...'
                : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            </Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenSettings}>
              <Text style={styles.secondaryButtonText}>Manage house in Settings</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* House Fairness */}
        {loadingFairness ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : fairnessData ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <Text style={styles.sectionSubtitle}>
              Rolling {fairnessData.windowDays ?? ROLLING_WINDOW_DAYS}-day balance.
            </Text>
            {currentUserDeviation !== null && (
              <Text style={styles.fairnessSummary}>
                You're {Math.abs(Math.round(currentUserDeviation))} points{' '}
                {currentUserDeviation >= 0 ? 'above' : 'behind'} the average.
              </Text>
            )}
            {fairnessRange && (
              <>
                <RNView style={styles.fairnessScale}>
                  <RNView style={styles.fairnessTrack} />
                  <RNView
                    style={[
                      styles.fairnessAverageMarker,
                      { left: `${getFairnessPosition(fairnessRange.average) * 100}%` },
                    ]}
                  />
                  {sortedFairnessStats.map((member) => {
                    const position = getFairnessPosition(member.totalPoints) * 100;
                    const isCurrentUser = member.userId === currentUserId;
                    const dotStyle = isCurrentUser
                      ? styles.fairnessDotCurrent
                      : member.deviation >= 0
                      ? styles.fairnessDotPositive
                      : styles.fairnessDotNegative;
                    const photoUrl = memberPhotoMap.get(member.userId) ?? null;
                    const fallbackColor = getFallbackColor(member.userId);
                    return (
                      <Pressable
                        key={member.userId}
                        style={[styles.fairnessDot, dotStyle, { left: `${position}%` }]}
                        onPress={() => {
                          const deviationText = `${member.deviation >= 0 ? '+' : ''}${Math.round(
                            member.deviation
                          )} vs avg`;
                          Alert.alert(
                            member.userName,
                            `${member.totalPoints} pts • ${deviationText}`
                          );
                        }}
                      >
                        {photoUrl ? (
                          <Image source={{ uri: photoUrl }} style={styles.fairnessAvatar} />
                        ) : (
                          <RNView
                            style={[
                              styles.fairnessAvatar,
                              { backgroundColor: fallbackColor },
                            ]}
                          >
                            <Text style={styles.fairnessAvatarText}>
                              {getInitial(member.userName)}
                            </Text>
                          </RNView>
                        )}
                      </Pressable>
                    );
                  })}
                </RNView>
                <RNView style={styles.fairnessLegend}>
                  <Text style={styles.fairnessLegendText}>Behind</Text>
                  <Text style={styles.fairnessLegendText}>Ahead</Text>
                </RNView>
              </>
            )}
            <RNView style={styles.fairnessList}>
              {sortedFairnessStats.length === 0 ? (
                <Text style={styles.description}>No fairness data yet.</Text>
              ) : (
                sortedFairnessStats.map((member) => (
                  <RNView key={member.userId} style={styles.fairnessRow}>
                    <Text style={styles.fairnessMemberName}>
                      {member.userName}
                      {member.userId === currentUserId ? ' (You)' : ''}
                    </Text>
                    <RNView style={styles.fairnessMeta}>
                      <Text style={styles.fairnessPoints}>
                        {member.totalPoints} pts
                      </Text>
                      <RNView
                        style={[
                          styles.fairnessDeltaBadge,
                          member.deviation >= 0
                            ? styles.fairnessDeltaPositive
                            : styles.fairnessDeltaNegative,
                        ]}
                      >
                        <Text style={styles.fairnessDeltaText}>
                          {member.deviation >= 0 ? '+' : ''}
                          {Math.round(member.deviation)} avg
                        </Text>
                      </RNView>
                    </RNView>
                  </RNView>
                ))
              )}
            </RNView>
          </View>
        ) : null}

        {/* Chores Snapshot */}
        {loadingChores ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chores Snapshot</Text>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chores Snapshot</Text>
            <Text style={styles.sectionSubtitle}>
              Open tasks and who they're waiting on.
            </Text>
            <RNView style={styles.statsRow}>
              <RNView style={styles.statCard}>
                <Text style={styles.statValue}>{choreSummary.totalOpen}</Text>
                <Text style={styles.statLabel}>Open</Text>
              </RNView>
              <RNView style={styles.statCard}>
                <Text style={styles.statValue}>{choreSummary.assignedToYou}</Text>
                <Text style={styles.statLabel}>Assigned to you</Text>
              </RNView>
              <RNView style={styles.statCard}>
                <Text style={styles.statValue}>{choreSummary.unassigned}</Text>
                <Text style={styles.statLabel}>Unassigned</Text>
              </RNView>
              <RNView style={styles.statCard}>
                <Text
                  style={[
                    styles.statValue,
                    choreSummary.overdue > 0 && styles.statValueDanger,
                  ]}
                >
                  {choreSummary.overdue}
                </Text>
                <Text style={styles.statLabel}>Overdue</Text>
              </RNView>
            </RNView>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenChores}>
              <Text style={styles.secondaryButtonText}>View chores</Text>
            </TouchableOpacity>
          </View>
        )}

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
              placeholderTextColor={colors.muted}
              value={nudgeInput}
              onChangeText={setNudgeInput}
            />
            <RNView style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalActionButton, styles.modalActionCancel]}
                onPress={() => setNudgeModalVisible(false)}
              >
                <Text style={styles.modalActionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalActionButton,
                  styles.modalActionConfirm,
                  nudgeSubmitting && styles.buttonDisabled,
                ]}
                onPress={handleSendNudge}
                disabled={nudgeSubmitting}
              >
                {nudgeSubmitting ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.modalActionButtonText}>Send nudge</Text>
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

const createStyles = (colors: AppTheme) => StyleSheet.create({
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
    color: colors.accent,
    marginBottom: 32,
  },
  alfredCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  alfredBadgeText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '700',
  },
  alfredIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  alfredTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
  },
  alfredLink: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  alfredMessage: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  alfredMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
  alfredActionsRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  alfredButton: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  alfredButtonText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 24,
    marginBottom: 16,
  },
  houseName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 16,
  },
  memberCount: {
    fontSize: 16,
    color: colors.muted,
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: colors.accentSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  fairnessSummary: {
    fontSize: 15,
    color: colors.accent,
    marginBottom: 14,
    fontWeight: '600',
  },
  fairnessScale: {
    position: 'relative',
    height: 36,
    justifyContent: 'center',
    marginBottom: 8,
  },
  fairnessTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  fairnessAverageMarker: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: colors.accent,
    top: 4,
  },
  fairnessDot: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    top: 6,
    transform: [{ translateX: -12 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fairnessDotCurrent: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  fairnessDotPositive: {
    borderWidth: 2,
    borderColor: colors.success,
  },
  fairnessDotNegative: {
    borderWidth: 2,
    borderColor: colors.danger,
  },
  fairnessAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  fairnessAvatarText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '700',
  },
  fairnessLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fairnessLegendText: {
    fontSize: 12,
    color: colors.muted,
  },
  fairnessList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  fairnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fairnessMemberName: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '500',
  },
  fairnessMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fairnessPoints: {
    fontSize: 13,
    color: colors.muted,
    marginRight: 8,
  },
  fairnessDeltaBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fairnessDeltaPositive: {
    backgroundColor: colors.successSoft,
  },
  fairnessDeltaNegative: {
    backgroundColor: colors.dangerSoft,
  },
  fairnessDeltaText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 4,
  },
  statValueDanger: {
    color: '#DC2626',
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
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
    color: colors.accent,
  },
  modalCloseText: {
    fontSize: 14,
    color: colors.muted,
  },
  modalPrimaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalPrimaryButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  modalList: {
    maxHeight: 360,
  },
  notificationRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.accent,
    marginBottom: 4,
  },
  notificationMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  modalLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.accent,
    backgroundColor: colors.card,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionCancel: {
    backgroundColor: '#DC2626',
    marginRight: 12,
  },
  modalActionConfirm: {
    backgroundColor: colors.accent,
    marginLeft: 12,
  },
  modalActionButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});

