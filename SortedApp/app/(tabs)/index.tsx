import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
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
  AppState,
  AppStateStatus,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import choreService, { ChoreData, ROLLING_WINDOW_DAYS } from '@/services/choreService';
import financeService, { TransactionData } from '@/services/financeService';
import calendarService, { CalendarEventData } from '@/services/calendarService';
import notificationService from '@/services/notificationService';
import useAlfred from '@/hooks/useAlfred';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/api/firebase';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import ScreenShell from '@/components/ScreenShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFirstName } from '@/utils/name';

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
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + 120;
  const scrollY = useRef(new Animated.Value(0));
  const headerOpacity = scrollY.current.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.92],
    extrapolate: 'clamp',
  });
  const hasShownToastRef = useRef(false);
  const userName = getFirstName(userProfile?.name || 'User', 'User');
  const houseId = userProfile?.houseId;
  const currentUserId = user?.uid;

  const [members, setMembers] = useState<Member[]>([]);
  const [fairnessData, setFairnessData] = useState<FairnessData | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingFairness, setLoadingFairness] = useState(true);
  const [loadingChores, setLoadingChores] = useState(true);
  const [chores, setChores] = useState<ChoreData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [events, setEvents] = useState<CalendarEventData[]>([]);
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
  const [toastNotification, setToastNotification] = useState<any>(null);
  const toastAnim = useRef(new Animated.Value(0));
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    notifications,
    latestNotification,
    unreadNotifications,
    markAsRead,
    getNextUnreadToast,
    markToastSeen,
    resetToastSeen,
  } = useAlfred({
    houseId: houseId ?? null,
    userId: currentUserId ?? null,
  });

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
            name: getFirstName(data.name || 'Unknown', 'Unknown'),
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

  useEffect(() => {
    if (!houseId) return;
    const unsubscribe = financeService.subscribeToTransactions(houseId, (updated) => {
      setTransactions(updated);
    });
    return () => unsubscribe();
  }, [houseId]);

  useEffect(() => {
    if (!houseId) return;
    const unsubscribe = calendarService.subscribeToEvents(houseId, (updated) => {
      setEvents(updated);
    });
    return () => unsubscribe();
  }, [houseId]);

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const getChoreDueDate = (chore: ChoreData, referenceDate: Date) => {
    if (chore.nextDueAt?.toDate) {
      return startOfDay(chore.nextDueAt.toDate());
    }
    if (chore.frequency === 'one-time') {
      return chore.status === 'completed' ? null : startOfDay(referenceDate);
    }
    if (chore.lastCompletedAt?.toDate) {
      const lastCompleted = startOfDay(chore.lastCompletedAt.toDate());
      const daysToAdd = chore.frequency === 'daily' ? 1 : 7;
      return new Date(
        lastCompleted.getFullYear(),
        lastCompleted.getMonth(),
        lastCompleted.getDate() + daysToAdd
      );
    }
    if (chore.createdAt?.toDate) {
      return startOfDay(chore.createdAt.toDate());
    }
    return startOfDay(referenceDate);
  };

  const getDueLabel = (dueDate: Date | null) => {
    if (!dueDate) return 'No due date';
    const today = startOfDay(new Date());
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`;
    }
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays} days`;
  };

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
      setChores(chores);
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

  const handleOpenFinance = () => {
    router.push('/(tabs)/finance');
  };

  const handleOpenCalendar = () => {
    router.push('/(tabs)/calendar');
  };

  const handleOpenAlfredModal = () => {
    setAlfredModalVisible(true);
    unreadNotifications.forEach((notification) => {
      markAsRead(notification.notificationId);
    });
  };

  const handleNotificationPress = (notification: any) => {
    if (!notification) return;
    markAsRead(notification.notificationId);
    if (notification.type === 'BILL_CONTESTED' && notification.metadata?.transactionId) {
      setAlfredModalVisible(false);
      router.push({
        pathname: '/(tabs)/finance',
        params: { focusTransactionId: notification.metadata.transactionId },
      });
    }
  };

  const hideToast = useCallback(
    (markRead: boolean) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      const current = toastNotification;
      Animated.timing(toastAnim.current, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        setToastNotification(null);
        if (markRead && current?.notificationId) {
          markAsRead(current.notificationId);
        }
      });
    },
    [markAsRead, toastNotification]
  );

  const showToast = useCallback(
    (notification: any) => {
      setToastNotification(notification);
      Animated.timing(toastAnim.current, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        hideToast(false);
      }, 6000);
    },
    [hideToast]
  );

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

  const formatNotificationType = (type: string) => {
    const labels: Record<string, string> = {
      CHORE_DUE: 'Chore update',
      BILL_ADDED: 'Bill added',
      BILL_CONTESTED: 'Bill contested',
      NUDGE: 'Nudge',
      MEETING_REQUEST: 'House meeting',
    };
    if (labels[type]) return labels[type];
    return type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (match) => match.toUpperCase());
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
  const userPhotoUrl = userProfile?.photoUrl ?? null;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const nextChoreSummary = useMemo(() => {
    const today = startOfDay(new Date());
    const openChores = chores.filter((chore) => chore.status !== 'completed');
    const withDue = openChores
      .map((chore) => ({
        chore,
        dueDate: getChoreDueDate(chore, today),
      }))
      .filter((item) => item.dueDate);

    const active = withDue.filter((item) => item.dueDate! <= today);
    const upcoming = withDue.filter((item) => item.dueDate! > today);

    const pickFrom = (items: typeof withDue) => {
      const mine = currentUserId
        ? items.filter((item) => item.chore.assignedTo === currentUserId)
        : [];
      const pool = mine.length ? mine : items;
      const sorted = [...pool].sort(
        (a, b) => a.dueDate!.getTime() - b.dueDate!.getTime()
      );
      return { item: sorted[0], count: sorted.length - 1, isPersonal: mine.length > 0 };
    };

    if (active.length) {
      return { ...pickFrom(active), bucket: 'active' as const };
    }
    if (upcoming.length) {
      return { ...pickFrom(upcoming), bucket: 'upcoming' as const };
    }
    return { item: null, count: 0, bucket: 'empty' as const, isPersonal: false };
  }, [chores, currentUserId]);

  const nextBillSummary = useMemo(() => {
    const unsettled = transactions.filter((transaction) => {
      const totalParticipants = transaction.splitWith?.length ?? 0;
      const confirmedCount = transaction.confirmedBy?.length ?? 0;
      return totalParticipants > 0 && confirmedCount < totalParticipants;
    });

    const relevant = unsettled.filter(
      (transaction) =>
        transaction.payerId === currentUserId ||
        (transaction.splitWith || []).includes(currentUserId ?? '')
    );

    const list = relevant.length ? relevant : unsettled;
    if (!list.length) {
      return { transaction: null, count: 0, isPersonal: false };
    }

    const sorted = [...list].sort((a, b) => {
      const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return aDate - bDate;
    });

    return {
      transaction: sorted[0],
      count: sorted.length - 1,
      isPersonal: relevant.length > 0,
    };
  }, [transactions, currentUserId]);

  const nextEventSummary = useMemo(() => {
    const today = startOfDay(new Date());
    const occurrences = events
      .map((event) => {
        const baseDate = startOfDay(event.startDate.toDate());
        const recurrence = event.recurrence || {
          frequency: 'none',
          interval: 1,
          endDate: null,
        };
        const interval = Math.max(1, recurrence.interval || 1);
        const recurrenceEnd = recurrence.endDate?.toDate
          ? startOfDay(recurrence.endDate.toDate())
          : null;

        const advance = (date: Date) => {
          switch (recurrence.frequency) {
            case 'daily':
              return new Date(date.getFullYear(), date.getMonth(), date.getDate() + interval);
            case 'weekly':
              return new Date(date.getFullYear(), date.getMonth(), date.getDate() + interval * 7);
            case 'monthly':
              return new Date(date.getFullYear(), date.getMonth() + interval, date.getDate());
            case 'yearly':
              return new Date(date.getFullYear() + interval, date.getMonth(), date.getDate());
            default:
              return date;
          }
        };

        if (recurrence.frequency === 'none') {
          return baseDate >= today
            ? { event, occurrenceDate: baseDate }
            : null;
        }

        if (recurrenceEnd && recurrenceEnd < today) {
          return null;
        }

        let current = baseDate;
        while (current < today) {
          current = advance(current);
          if (recurrenceEnd && current > recurrenceEnd) {
            return null;
          }
        }

        return { event, occurrenceDate: current };
      })
      .filter(Boolean) as Array<{ event: CalendarEventData; occurrenceDate: Date }>;

    const personal = occurrences.filter(
      (item) => item.event.createdBy === currentUserId
    );
    const list = personal.length ? personal : occurrences;

    if (!list.length) {
      return { item: null, count: 0, isPersonal: false };
    }

    const sorted = [...list].sort(
      (a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime()
    );

    return {
      item: sorted[0],
      count: sorted.length - 1,
      isPersonal: personal.length > 0,
    };
  }, [events, currentUserId]);

  useEffect(() => {
    if (!houseId || !currentUserId) return;
    if (hasShownToastRef.current) return;
    const nextToast = getNextUnreadToast();
    if (!nextToast) return;
    hasShownToastRef.current = true;
    markToastSeen(nextToast.notificationId);
    showToast(nextToast);
  }, [houseId, currentUserId, getNextUnreadToast, markToastSeen, showToast]);

  useEffect(() => {
    const handleAppState = (status: AppStateStatus) => {
      if (status === 'active') {
        hasShownToastRef.current = false;
        resetToastSeen();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [resetToastSeen]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // No house case
  if (!houseId) {
    return (
      <ScreenShell>
        <Animated.ScrollView
          style={styles.container}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          <RNView style={[styles.content, { paddingBottom: bottomPadding }]}>
            <Text style={styles.greeting}>Welcome back, {userName}!</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>No House</Text>
              <Text style={styles.description}>
                You're not in a house yet. Join an existing house or create a new one to get
                started.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push('/(auth)/house-setup')}
              >
                <Text style={styles.primaryButtonText}>Set Up House</Text>
              </TouchableOpacity>
            </View>
          </RNView>
        </Animated.ScrollView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={styles.container}>
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <RNView style={[styles.content, { paddingBottom: bottomPadding }]}>
        <RNView style={styles.headerBlock}>
          <RNView style={styles.headerRow}>
            <RNView style={styles.profileRow}>
              <Pressable onPress={() => router.push('/(tabs)/settings')}>
                {userPhotoUrl ? (
                  <Image
                    source={{ uri: userPhotoUrl }}
                    style={styles.profileAvatar}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={150}
                  />
                ) : (
                  <RNView style={styles.profileAvatarFallback}>
                    <Text style={styles.profileAvatarText}>{getInitial(userName)}</Text>
                  </RNView>
                )}
              </Pressable>
              <RNView>
                <Text style={styles.headerGreeting}>Welcome back</Text>
                <Text style={styles.headerName}>{userName}</Text>
              </RNView>
            </RNView>
            <RNView style={styles.headerActions}>
              <Pressable style={styles.inboxButton} onPress={handleOpenAlfredModal}>
                <FontAwesome name="bell" size={16} color={colors.accent} />
                {unreadCount > 0 && (
                  <RNView style={styles.inboxBadge}>
                    <Text style={styles.inboxBadgeText}>{unreadCount}</Text>
                  </RNView>
                )}
              </Pressable>
            </RNView>
          </RNView>
          <TouchableOpacity
            style={styles.nudgeButton}
            onPress={() => setNudgeModalVisible(true)}
          >
            <Text style={styles.nudgeButtonText}>Ask Alfred</Text>
          </TouchableOpacity>
        </RNView>

        <RNView style={styles.todayCard}>
          <RNView style={styles.todayHeader}>
            <Text style={styles.todayTitle}>Today</Text>
            <Text style={styles.todayDate}>{todayLabel}</Text>
          </RNView>

          <Pressable style={styles.todayRow} onPress={handleOpenChores}>
            <RNView>
              <Text style={styles.todayLabel}>
                {nextChoreSummary.item
                  ? nextChoreSummary.isPersonal
                    ? 'Your next chore'
                    : 'House chore'
                  : 'Next chore'}
              </Text>
              <Text style={styles.todayValue}>
                {nextChoreSummary.item
                  ? nextChoreSummary.item.chore.title
                  : 'Nothing due today'}
              </Text>
              <Text style={styles.todayMeta}>
                {nextChoreSummary.item
                  ? getDueLabel(nextChoreSummary.item.dueDate ?? null)
                  : 'You are all caught up.'}
              </Text>
            </RNView>
            {nextChoreSummary.count > 0 && (
              <RNView style={styles.todayCountBadge}>
                <Text style={styles.todayCountText}>+{nextChoreSummary.count}</Text>
              </RNView>
            )}
          </Pressable>

          <Pressable style={styles.todayRow} onPress={handleOpenFinance}>
            <RNView>
              <Text style={styles.todayLabel}>
                {nextBillSummary.transaction
                  ? nextBillSummary.isPersonal
                    ? 'Your next bill'
                    : 'House bill'
                  : 'Next bill'}
              </Text>
              <Text style={styles.todayValue}>
                {nextBillSummary.transaction
                  ? nextBillSummary.transaction.description || 'Shared bill'
                  : 'No open bills'}
              </Text>
              <Text style={styles.todayMeta}>
                {nextBillSummary.transaction
                  ? `$${Number(nextBillSummary.transaction.amount).toFixed(2)}`
                  : 'All settled for now.'}
              </Text>
            </RNView>
            {nextBillSummary.count > 0 && (
              <RNView style={styles.todayCountBadge}>
                <Text style={styles.todayCountText}>+{nextBillSummary.count}</Text>
              </RNView>
            )}
          </Pressable>

          <Pressable style={styles.todayRow} onPress={handleOpenCalendar}>
            <RNView>
              <Text style={styles.todayLabel}>
                {nextEventSummary.item
                  ? nextEventSummary.isPersonal
                    ? 'Your next event'
                    : 'House event'
                  : 'Next event'}
              </Text>
              <Text style={styles.todayValue}>
                {nextEventSummary.item
                  ? nextEventSummary.item.event.title
                  : 'No upcoming events'}
              </Text>
              <Text style={styles.todayMeta}>
                {nextEventSummary.item
                  ? nextEventSummary.item.occurrenceDate.toLocaleDateString()
                  : 'Nothing scheduled yet.'}
              </Text>
            </RNView>
            {nextEventSummary.count > 0 && (
              <RNView style={styles.todayCountBadge}>
                <Text style={styles.todayCountText}>+{nextEventSummary.count}</Text>
              </RNView>
            )}
          </Pressable>
        </RNView>

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
                            getFirstName(member.userName, 'User'),
                            `${member.totalPoints} pts | ${deviationText}`
                          );
                        }}
                      >
                        {photoUrl ? (
                          <Image
                            source={{ uri: photoUrl }}
                            style={styles.fairnessAvatar}
                            contentFit="cover"
                            cachePolicy="disk"
                            transition={150}
                          />
                        ) : (
                          <RNView
                            style={[
                              styles.fairnessAvatar,
                              { backgroundColor: fallbackColor },
                            ]}
                          >
                            <Text style={styles.fairnessAvatarText}>
                              {getInitial(getFirstName(member.userName, 'User'))}
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
                      {getFirstName(member.userName, 'User')}
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

        </RNView>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.stickyHeader,
          {
            paddingTop: insets.top,
            height: insets.top + 56,
            opacity: headerOpacity,
          },
        ]}
      >
        <Text style={styles.stickyHeaderTitle}>Dashboard</Text>
      </Animated.View>

      {toastNotification && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastWrapper,
            {
              paddingTop: insets.top + 8,
              transform: [
                {
                  translateY: toastAnim.current.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-80, 0],
                  }),
                },
              ],
              opacity: toastAnim.current,
            },
          ]}
        >
          <RNView style={styles.toastCard}>
            <RNView style={styles.toastHeader}>
              <Text style={styles.toastTitle}>Alfred</Text>
              <Pressable onPress={() => hideToast(false)}>
                <Text style={styles.toastClose}>×</Text>
              </Pressable>
            </RNView>
            <Text style={styles.toastMessage}>{toastNotification.message}</Text>
            <RNView style={styles.toastActions}>
              {toastNotification.type === 'BILL_CONTESTED' &&
                toastNotification.metadata?.transactionId && (
                  <Pressable
                    style={styles.toastAction}
                    onPress={() => {
                      hideToast(true);
                      router.push({
                        pathname: '/(tabs)/finance',
                        params: { focusTransactionId: toastNotification.metadata.transactionId },
                      });
                    }}
                  >
                    <Text style={styles.toastActionText}>View</Text>
                  </Pressable>
                )}
              <Pressable
                style={styles.toastAction}
                onPress={() => hideToast(true)}
              >
                <Text style={styles.toastActionText}>Mark read</Text>
              </Pressable>
            </RNView>
          </RNView>
        </Animated.View>
      )}

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
                  <Pressable
                    key={notification.notificationId}
                    style={styles.notificationRow}
                    onPress={() => handleNotificationPress(notification)}
                  >
                    <Text style={styles.notificationMessage}>
                      {notification.message}
                    </Text>
                    <Text style={styles.notificationMeta}>
                      {formatNotificationType(notification.type)} -{' '}
                      {formatNotificationTime(notification.createdAt)}
                    </Text>
                  </Pressable>
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
    </ScreenShell>
  );
}

const createStyles = (colors: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 26,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 32,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 40,
  },
  toastCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  toastClose: {
    fontSize: 18,
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 6,
  },
  toastMessage: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  toastActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  toastAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    marginLeft: 8,
  },
  toastActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  headerBlock: {
    marginBottom: 18,
  },
  headerGreeting: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  headerName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
  },
  profileAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inboxButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 999,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadgeText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '700',
  },
  nudgeButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  nudgeButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '600',
  },
  todayCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  todayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
  },
  todayDate: {
    fontSize: 12,
    color: colors.muted,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  todayLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  todayValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 2,
  },
  todayMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  todayCountBadge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  todayCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
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
    borderBottomColor: colors.border,
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
    color: colors.danger,
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
    backgroundColor: colors.danger,
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

