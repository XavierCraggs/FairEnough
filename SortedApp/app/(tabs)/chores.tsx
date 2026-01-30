import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View as RNView,
  useColorScheme,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '../../contexts/AuthContext';
import choreService, {
  ChoreData,
  ChoreServiceError,
  ROLLING_WINDOW_DAYS,
} from '../../services/choreService';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import Slider from '@react-native-community/slider';
import {
  impactLight,
  impactMedium,
  notifyError,
  notifySuccess,
  notifyWarning,
  selectionChanged,
} from '@/utils/haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import ScreenShell from '@/components/ScreenShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFirstName } from '@/utils/name';
import notificationService from '@/services/notificationService';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import ExpandableTitle from '@/components/ExpandableTitle';
import ProfileOverviewModal, {
  ProfileOverviewUser,
} from '@/components/ProfileOverviewModal';
import { useLocalSearchParams } from 'expo-router';

const BORDER_RADIUS = 16;

type FrequencyOption = 'daily' | 'weekly' | 'monthly' | 'one-time';
type StatusFilter = 'active' | 'upcoming' | 'history';

interface MemberOption {
  userId: string;
  name: string;
  fullName?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  totalPoints?: number;
  createdAt?: any;
}

interface FairnessMemberStat {
  userId: string;
  userName: string;
  totalPoints: number;
  deviation: number;
}

type ChoreListItem =
  | { type: 'header'; title: string }
  | { type: 'chore'; chore: ChoreData };

const FREQUENCY_OPTIONS: { label: string; value: FrequencyOption }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'One-time', value: 'one-time' },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'History', value: 'history' },
];

const CHORE_TEMPLATES: Array<{
  id: string;
  title: string;
  description?: string;
  frequency: FrequencyOption;
  points: number;
}> = [
  { id: 'bins', title: 'Bins', frequency: 'weekly', points: 3 },
  { id: 'bathrooms', title: 'Bathrooms', frequency: 'weekly', points: 7 },
  { id: 'dishwasher', title: 'Dishwasher', frequency: 'daily', points: 4 },
  { id: 'vacuum', title: 'Vacuum', frequency: 'weekly', points: 5 },
  { id: 'mop', title: 'Mop floors', frequency: 'weekly', points: 6 },
  { id: 'mowing', title: 'Mowing', frequency: 'weekly', points: 6 },
  {
    id: 'whipper',
    title: 'Whipper snipping',
    description: 'Edges and borders',
    frequency: 'weekly',
    points: 5,
  },
  { id: 'laundry', title: 'Laundry', frequency: 'weekly', points: 4 },
  { id: 'recycling', title: 'Recycling', frequency: 'weekly', points: 3 },
  { id: 'dusting', title: 'Dusting', frequency: 'weekly', points: 3 },
  { id: 'groceries', title: 'Groceries', frequency: 'weekly', points: 4 },
];

const FALLBACK_AVATAR_COLORS = [
  '#2D7FF9',
  '#10B981',
  '#F97316',
  '#EF4444',
  '#8B5CF6',
  '#F59E0B',
  '#06B6D4',
  '#84CC16',
  '#EC4899',
];

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const formatReadableDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const addMonths = (date: Date, months: number) => {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const day = date.getDate();
  const firstOfTargetMonth = new Date(year, month, 1);
  const lastDay = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth(),
    Math.min(day, lastDay)
  );
};

const getDueDate = (chore: ChoreData, referenceDate: Date) => {
  if (chore.nextDueAt?.toDate) {
    return startOfDay(chore.nextDueAt.toDate());
  }
  if (chore.frequency === 'one-time') {
    return chore.status === 'completed' ? null : startOfDay(referenceDate);
  }
  if (chore.lastCompletedAt?.toDate) {
    const lastCompleted = startOfDay(chore.lastCompletedAt.toDate());
    if (chore.frequency === 'daily') {
      return addDays(lastCompleted, 1);
    }
    if (chore.frequency === 'weekly') {
      return addDays(lastCompleted, 7);
    }
    if (chore.frequency === 'monthly') {
      return addMonths(lastCompleted, 1);
    }
  }
  if (chore.createdAt?.toDate) {
    return startOfDay(chore.createdAt.toDate());
  }
  return startOfDay(referenceDate);
};

const getDueLabel = (dueDate: Date | null) => {
  if (!dueDate) return null;
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

const formatHistoryDate = (date: Date) => {
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const diffDays = Math.round((today.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export default function ChoresScreen() {
  const { user, userProfile, activeHouseId } = useAuth();
  const { openCreate } = useLocalSearchParams<{ openCreate?: string }>();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0));
  const quickStartOpenedRef = useRef(false);
  const headerOpacity = scrollY.current.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.92],
    extrapolate: 'clamp',
  });
  const houseId = activeHouseId ?? null;
  const currentUserId = user?.uid ?? null;

  const [chores, setChores] = useState<ChoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [isPremiumHouse, setIsPremiumHouse] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [fairnessLoading, setFairnessLoading] = useState(false);
  const [averagePoints, setAveragePoints] = useState<number | null>(null);
  const [memberStats, setMemberStats] = useState<FairnessMemberStat[]>([]);
  const [fairnessWindowDays, setFairnessWindowDays] = useState<number | null>(null);
  const [fairnessExpanded, setFairnessExpanded] = useState(false);
  const [activeFairnessUserId, setActiveFairnessUserId] = useState<string | null>(
    null
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sortByPointsDesc, setSortByPointsDesc] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [densityMode, setDensityMode] = useState<'comfortable' | 'compact'>('comfortable');
  const [nudgeSending, setNudgeSending] = useState(false);
  const [expandedChoreIds, setExpandedChoreIds] = useState<Set<string>>(new Set());

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChore, setEditingChore] = useState<ChoreData | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [pointsInput, setPointsInput] = useState(5);
  const [assignedToInput, setAssignedToInput] = useState<string | null>(null);
  const [frequencyInput, setFrequencyInput] = useState<FrequencyOption>('one-time');
  const [assignmentModeInput, setAssignmentModeInput] = useState<'fair' | 'weeklyLock'>(
    'fair'
  );
  const [lockDurationDaysInput, setLockDurationDaysInput] = useState(7);
  const [eligibleAssigneesInput, setEligibleAssigneesInput] = useState<string[]>(
    []
  );
  const [submitting, setSubmitting] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [dueDateInput, setDueDateInput] = useState<Date>(startOfDay(new Date()));
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const lastOverdueCheckRef = useRef<number>(0);
  const lastAutoAssignRef = useRef<number>(0);

  const isInHouse = !!houseId;

  useEffect(() => {
    if (!houseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = choreService.subscribeToHouseChores(houseId, (updatedChores) => {
      setChores(updatedChores);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [houseId]);

  useEffect(() => {
    if (!houseId || !user?.uid || !chores.length) {
      return;
    }

    const now = Date.now();
    if (now - lastOverdueCheckRef.current < 60 * 1000) {
      return;
    }
    lastOverdueCheckRef.current = now;
    choreService.notifyOverdueChores(houseId, user.uid);
  }, [houseId, user?.uid, chores]);

  useEffect(() => {
    if (!houseId || !user?.uid || !chores.length) {
      return;
    }

    const now = Date.now();
    if (now - lastAutoAssignRef.current < 2 * 60 * 1000) {
      return;
    }
    lastAutoAssignRef.current = now;
    choreService.autoAssignDueChores(houseId, user.uid);
  }, [houseId, user?.uid, chores]);

  // Subscribe to house members to populate "Assign to" dropdown
  useEffect(() => {
    if (!houseId) {
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('houseId', '==', houseId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedMembers: MemberOption[] = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            userId: doc.id,
            name: getFirstName(data.name || 'Unnamed', 'Unnamed'),
            fullName: data.name || null,
            photoUrl: data.photoUrl || data.photoURL || null,
            email: data.email || null,
            totalPoints: typeof data.totalPoints === 'number' ? data.totalPoints : 0,
            createdAt: data.createdAt || null,
          };
        });
        setMembers(loadedMembers);
        setMembersLoading(false);
      },
      () => {
        setMembers([]);
        setMembersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  useEffect(() => {
    if (frequencyInput === 'one-time' && assignmentModeInput === 'weeklyLock') {
      setAssignmentModeInput('fair');
    }
  }, [frequencyInput, assignmentModeInput]);

  useEffect(() => {
    if (!members.length) {
      return;
    }

    const allIds = members.map((member) => member.userId);

    if (!isPremiumHouse) {
      setEligibleAssigneesInput(allIds);
      return;
    }

    if (editingChore) {
      const stored = editingChore.eligibleAssignees;
      if (stored && stored.length) {
        setEligibleAssigneesInput(stored);
      } else {
        setEligibleAssigneesInput(allIds);
      }
      return;
    }

    if (!eligibleAssigneesInput.length) {
      setEligibleAssigneesInput(allIds);
    }
  }, [members, editingChore, isPremiumHouse, eligibleAssigneesInput.length]);

  useEffect(() => {
    if (!houseId) {
      setIsPremiumHouse(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'houses', houseId),
      (snapshot) => {
        const data = snapshot.data() as any;
        setIsPremiumHouse(!!data?.isPremium);
        if (data?.choreDensity === 'compact') {
          setDensityMode('compact');
        } else {
          setDensityMode('comfortable');
        }
      },
      () => {
        setIsPremiumHouse(false);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  const loadFairness = useCallback(async () => {
    if (!houseId) return;
    try {
      setFairnessLoading(true);
      const result = await choreService.calculateHouseFairness(houseId);
      setAveragePoints(result.averagePoints);
      setMemberStats(result.memberStats);
      setFairnessWindowDays(result.windowDays ?? null);
    } catch (err: any) {
      const message =
        (err as ChoreServiceError)?.message ?? 'Unable to calculate house fairness.';
      Alert.alert('Chores', message);
    } finally {
      setFairnessLoading(false);
    }
  }, [houseId]);

  useEffect(() => {
    loadFairness();
  }, [loadFairness]);

  const handleError = useCallback((err: any, fallbackMessage: string) => {
    const serviceError = err as ChoreServiceError;
    const message = serviceError?.message || fallbackMessage;
    setError(message);
    Alert.alert('Chores', message);
  }, []);

  const resetForm = () => {
    setEditingChore(null);
    setTitleInput('');
    setDescriptionInput('');
    setPointsInput(5);
    setAssignedToInput(null);
    setFrequencyInput('one-time');
    setAssignmentModeInput('fair');
    setLockDurationDaysInput(7);
    setEligibleAssigneesInput(members.map((member) => member.userId));
    setDueDateInput(startOfDay(new Date()));
    setShowDueDatePicker(false);
    setSetupStep(1);
  };

  const openCreateModal = () => {
    resetForm();
    impactLight();
    setModalVisible(true);
  };

  useEffect(() => {
    if (openCreate !== '1') return;
    if (quickStartOpenedRef.current) return;
    quickStartOpenedRef.current = true;
    openCreateModal();
  }, [openCreate]);

  const openEditModal = (chore: ChoreData) => {
    setEditingChore(chore);
    setTitleInput(chore.title);
    setDescriptionInput(chore.description ?? '');
    setPointsInput(chore.points);
    setAssignedToInput(chore.assignedTo);
    setFrequencyInput(chore.frequency);
    setAssignmentModeInput(chore.assignmentMode ?? 'fair');
    setLockDurationDaysInput(chore.lockDurationDays ?? 7);
    if (chore.eligibleAssignees && chore.eligibleAssignees.length) {
      setEligibleAssigneesInput(chore.eligibleAssignees);
    } else {
      setEligibleAssigneesInput(members.map((member) => member.userId));
    }
    setDueDateInput(
      chore.nextDueAt?.toDate ? startOfDay(chore.nextDueAt.toDate()) : startOfDay(new Date())
    );
    setShowDueDatePicker(false);
    setSetupStep(3);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const handleSubmit = async () => {
    if (!houseId || !user) {
      return;
    }

    if (!titleInput.trim()) {
      Alert.alert('Chores', 'Please enter a title for the chore.');
      return;
    }

    const points = Number(pointsInput);
    if (Number.isNaN(points) || points < 1 || points > 10) {
      Alert.alert('Chores', 'Please enter a difficulty score between 1 and 10.');
      return;
    }

    setSubmitting(true);

    try {
      const eligibleAssignees =
        isPremiumHouse &&
        eligibleAssigneesInput.length &&
        eligibleAssigneesInput.length !== members.length
          ? eligibleAssigneesInput
          : null;

      if (editingChore) {
        await choreService.updateChore(
          houseId,
          editingChore.choreId,
          {
            title: titleInput.trim(),
            description: descriptionInput.trim(),
            points,
            frequency: frequencyInput,
            dueDate: dueDateInput,
            assignmentMode: assignmentModeInput,
            lockDurationDays: lockDurationDaysInput,
            eligibleAssignees,
          },
          user.uid
        );

        if (assignedToInput !== editingChore.assignedTo) {
          await choreService.assignChore(
            houseId,
            editingChore.choreId,
            assignedToInput,
            user.uid
          );
        }
      } else {
        await choreService.addChore({
          houseId,
          title: titleInput.trim(),
          description: descriptionInput.trim(),
          points,
          assignedTo: assignedToInput,
          frequency: frequencyInput,
          dueDate: dueDateInput,
          createdBy: user.uid,
          assignmentMode: assignmentModeInput,
          lockDurationDays: lockDurationDaysInput,
          eligibleAssignees,
        });
      }

      resetForm();
      impactMedium();
      setModalVisible(false);
    } catch (err: any) {
      notifyError();
      handleError(err, 'Unable to save chore. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepAdvance = () => {
    if (setupStep === 1) {
      if (!titleInput.trim()) {
        Alert.alert('Chores', 'Please enter a title for the chore.');
        return;
      }
      setSetupStep(2);
      return;
    }

    if (setupStep === 2) {
      const points = Number(pointsInput);
      if (Number.isNaN(points) || points < 1 || points > 10) {
        Alert.alert('Chores', 'Please enter a difficulty score between 1 and 10.');
        return;
      }
      setSetupStep(3);
    }
  };

  const handleSelectAssignmentMode = (mode: 'fair' | 'weeklyLock') => {
    if (mode === 'weeklyLock' && !isPremiumHouse) {
      Alert.alert(
        'Premium feature',
        'Weekly role lock is part of House Pass. Upgrade to enable it.'
      );
      return;
    }
    setAssignmentModeInput(mode);
    if (mode === 'weeklyLock') {
      setLockDurationDaysInput(7);
    }
  };

  const handleToggleEligible = (memberId: string) => {
    if (!isPremiumHouse) {
      Alert.alert(
        'Premium feature',
        'Custom assignment pools are part of House Pass.'
      );
      return;
    }
    setEligibleAssigneesInput((current) => {
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      return next.length ? next : current;
    });
  };

  const handleCompleteChore = async (chore: ChoreData) => {
    if (!houseId || !user) return;
    try {
      await choreService.completeChore(houseId, chore.choreId, user.uid);
      loadFairness();
      notifySuccess();
      Alert.alert('Nice work!', 'Chore completed. Points added to your total.');
    } catch (err: any) {
      notifyError();
      handleError(err, 'Unable to complete chore. Please try again.');
    }
  };

  const handleDeleteChore = (chore: ChoreData) => {
    if (!houseId || !user) return;
    Alert.alert(
      'Delete chore',
      `Are you sure you want to delete "${chore.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            notifyWarning();
            try {
              await choreService.deleteChore(houseId, chore.choreId, user.uid);
            } catch (err: any) {
              notifyError();
              handleError(err, 'Unable to delete chore. Please try again.');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    if (!houseId) return;
    try {
      setRefreshing(true);
      await Promise.all([
        choreService.getHouseChores(houseId).then(setChores),
        loadFairness(),
      ]);
      if (user?.uid) {
        await choreService.autoAssignDueChores(houseId, user.uid);
      }
    } catch (err: any) {
      handleError(err, 'Unable to refresh chores.');
    } finally {
      setRefreshing(false);
    }
  }, [houseId, loadFairness, handleError, user?.uid]);

  const filteredAndSortedChores = useMemo(() => {
    let result = chores;
    const today = startOfDay(new Date());

    if (statusFilter === 'active') {
      result = result.filter((c) => {
        if (c.status === 'completed') return false;
        const dueDate = getDueDate(c, today);
        return !!dueDate && dueDate <= today;
      });
    } else if (statusFilter === 'history') {
      result = result.filter((c) => c.status === 'completed');
    } else if (statusFilter === 'upcoming') {
      result = result.filter((c) => {
        const dueDate = getDueDate(c, today);
        return !!dueDate && dueDate > today;
      });
    }

    return [...result].sort((a, b) => {
      if (statusFilter === 'active') {
        const dueA = getDueDate(a, today)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dueB = getDueDate(b, today)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
      }
      if (statusFilter === 'upcoming') {
        const dueA = getDueDate(a, today)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dueB = getDueDate(b, today)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
      }
      if (statusFilter === 'history') {
        const lastA = a.lastCompletedAt?.toDate ? a.lastCompletedAt.toDate().getTime() : 0;
        const lastB = b.lastCompletedAt?.toDate ? b.lastCompletedAt.toDate().getTime() : 0;
        if (lastA !== lastB) {
          return sortByPointsDesc ? lastB - lastA : lastA - lastB;
        }
      }
      return sortByPointsDesc ? b.points - a.points : a.points - b.points;
    });
  }, [chores, sortByPointsDesc, statusFilter]);

  const getAssignedName = (assignedTo: string | null) => {
    if (!assignedTo) return 'Unassigned';
    const member = members.find((m) => m.userId === assignedTo);
    return getFirstName(member?.name ?? 'Unassigned', 'Unassigned');
  };

  const getInitial = (name: string) => (name.trim() ? name.trim()[0].toUpperCase() : '?');

  const sortedFairnessStats = useMemo(() => {
    if (!memberStats.length) {
      return [];
    }
    return [...memberStats].sort((a, b) => {
      const delta = b.totalPoints - a.totalPoints;
      if (delta !== 0) return delta;
      const nameDelta = a.userName.localeCompare(b.userName);
      if (nameDelta !== 0) return nameDelta;
      return a.userId.localeCompare(b.userId);
    });
  }, [memberStats]);

  const memberPhotoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    members.forEach((member) => {
      map.set(member.userId, member.photoUrl ?? null);
    });
    return map;
  }, [members]);

  const memberEmailMap = useMemo(() => {
    const map = new Map<string, string | null>();
    members.forEach((member) => {
      map.set(member.userId, member.email ?? null);
    });
    return map;
  }, [members]);

  const memberPointsMap = useMemo(() => {
    const map = new Map<string, number>();
    members.forEach((member) => {
      if (typeof member.totalPoints === 'number') {
        map.set(member.userId, member.totalPoints);
      }
    });
    return map;
  }, [members]);

  const memberCreatedMap = useMemo(() => {
    const map = new Map<string, any>();
    members.forEach((member) => {
      if (member.createdAt) {
        map.set(member.userId, member.createdAt);
      }
    });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const orderedMembers = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
    let paletteIndex = 0;
    let hueSeed = 0.12;
    const goldenRatio = 0.61803398875;

    orderedMembers.forEach((member) => {
      if (paletteIndex < FALLBACK_AVATAR_COLORS.length) {
        map.set(member.userId, FALLBACK_AVATAR_COLORS[paletteIndex]);
        paletteIndex += 1;
        return;
      }

      hueSeed = (hueSeed + goldenRatio) % 1;
      const hue = Math.round(hueSeed * 360);
      map.set(member.userId, `hsl(${hue}, 68%, 52%)`);
    });

    return map;
  }, [members]);

  const openProfileOverview = useCallback((userId: string) => {
    setSelectedProfileId(userId);
    setProfileVisible(true);
  }, []);

  const selectedProfile = useMemo<ProfileOverviewUser | null>(() => {
    if (!selectedProfileId) return null;
    const member = members.find((entry) => entry.userId === selectedProfileId);
    const name = member?.fullName || member?.name || 'Housemate';
    const points = memberPointsMap.get(selectedProfileId);
    const createdAt = memberCreatedMap.get(selectedProfileId);
    const joinedDate =
      createdAt?.toDate?.() instanceof Date
        ? createdAt.toDate().toLocaleDateString(undefined, {
            month: 'short',
            year: 'numeric',
          })
        : null;
    const stats = [
      typeof points === 'number'
        ? { label: 'Points', value: `${Math.round(points)}` }
        : null,
      joinedDate ? { label: 'Member since', value: joinedDate } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
    return {
      userId: selectedProfileId,
      name,
      photoUrl: member?.photoUrl ?? null,
      email: member?.email ?? null,
      subtitle: 'Housemate',
      stats,
    };
  }, [selectedProfileId, members, memberPointsMap, memberCreatedMap]);

  const pendingPointsMap = useMemo(() => {
    const map = new Map<string, number>();
    const today = startOfDay(new Date());
    chores.forEach((chore) => {
      if (chore.status === 'completed') return;
      if (!chore.assignedTo) return;
      const dueDate = getDueDate(chore, today);
      if (!dueDate || dueDate > today) return;
      const points = Number.isFinite(chore.points) ? chore.points : 0;
      map.set(chore.assignedTo, (map.get(chore.assignedTo) ?? 0) + points);
    });
    return map;
  }, [chores]);

  const fairnessDetailRows = useMemo(() => {
    if (!sortedFairnessStats.length) return [];
    const withPending = sortedFairnessStats.map((member) => {
      const pendingPoints = pendingPointsMap.get(member.userId) ?? 0;
      const projectedTotal = member.totalPoints + pendingPoints;
      return { ...member, pendingPoints, projectedTotal };
    });
    const averageProjected =
      withPending.reduce((sum, member) => sum + member.projectedTotal, 0) /
      withPending.length;
    return withPending
      .map((member) => ({
        ...member,
        projectedDeviation: member.projectedTotal - averageProjected,
      }))
      .sort((a, b) => {
        const delta = a.projectedDeviation - b.projectedDeviation;
        if (delta !== 0) return delta;
        const nameDelta = a.userName.localeCompare(b.userName);
        if (nameDelta !== 0) return nameDelta;
        return a.userId.localeCompare(b.userId);
      });
  }, [pendingPointsMap, sortedFairnessStats]);

  const maxProjectedTotal = useMemo(() => {
    if (!fairnessDetailRows.length) return 1;
    return Math.max(
      1,
      ...fairnessDetailRows.map((member) => Math.max(member.projectedTotal, 0))
    );
  }, [fairnessDetailRows]);

  const averageProjected = useMemo(() => {
    if (!fairnessDetailRows.length) return 0;
    const sum = fairnessDetailRows.reduce((acc, member) => acc + member.projectedTotal, 0);
    return sum / fairnessDetailRows.length;
  }, [fairnessDetailRows]);

  const nextUpMember = fairnessDetailRows[0] ?? null;

  const fairnessRange = useMemo(() => {
    if (!memberStats.length) {
      return null;
    }
    const points = memberStats.map((stat) => stat.totalPoints);
    const average = averagePoints ?? points.reduce((sum, value) => sum + value, 0) / points.length;
    const minPoints = Math.min(...points, average);
    const maxPoints = Math.max(...points, average);
    const spread = Math.max(1, maxPoints - minPoints);
    const padding = Math.max(3, spread * 0.2);
    return {
      min: minPoints - padding,
      max: maxPoints + padding,
      average,
    };
  }, [memberStats, averagePoints]);

  const getFairnessPosition = (points: number) => {
    if (!fairnessRange) return 0.5;
    const range = fairnessRange.max - fairnessRange.min;
    if (range <= 0) return 0.5;
    const clamped = Math.min(fairnessRange.max, Math.max(fairnessRange.min, points));
    return (clamped - fairnessRange.min) / range;
  };

  const groupedItems = useMemo(() => {
    if (!filteredAndSortedChores.length) {
      return [] as ChoreListItem[];
    }

    if (statusFilter === 'history') {
      const list: ChoreListItem[] = [];
      const groups = new Map<string, ChoreData[]>();
      filteredAndSortedChores.forEach((chore) => {
        const completedAt = chore.lastCompletedAt?.toDate
          ? startOfDay(chore.lastCompletedAt.toDate())
          : startOfDay(new Date());
        const key = completedAt.toISOString();
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(chore);
      });
      const sortedDates = [...groups.keys()].sort((a, b) => (a > b ? -1 : 1));
      sortedDates.forEach((key) => {
        const date = new Date(key);
        list.push({ type: 'header', title: formatHistoryDate(date) });
        groups.get(key)!.forEach((chore) => list.push({ type: 'chore', chore }));
      });
      return list;
    }

    const today = startOfDay(new Date());
    const upcomingCutoff = addDays(today, 7);

    const buildGroups = (groups: Array<{ title: string; test: (date: Date) => boolean }>) => {
      const list: ChoreListItem[] = [];
      groups.forEach((group) => {
        const choresForGroup = filteredAndSortedChores.filter((chore) => {
          const dueDate = getDueDate(chore, today);
          return !!dueDate && group.test(dueDate);
        });
        if (choresForGroup.length) {
          list.push({ type: 'header', title: group.title });
          choresForGroup.forEach((chore) => list.push({ type: 'chore', chore }));
        }
      });
      return list;
    };

    if (statusFilter === 'active') {
      return buildGroups([
        { title: 'Overdue', test: (date) => date.getTime() < today.getTime() },
        { title: 'Due today', test: (date) => date.getTime() === today.getTime() },
      ]);
    }

    return buildGroups([
      { title: 'Today', test: (date) => date.getTime() === today.getTime() },
      { title: 'This week', test: (date) => date > today && date <= upcomingCutoff },
      { title: 'Later', test: (date) => date > upcomingCutoff },
    ]);
  }, [filteredAndSortedChores, statusFilter]);

  const handleSendNudge = async (chore: ChoreData, dueDate: Date) => {
    if (!houseId || !currentUserId) return;
    if (nudgeSending) return;
    setNudgeSending(true);
    try {
      const today = startOfDay(new Date());
      const action = dueDate.getTime() < today.getTime() ? 'overdue' : 'due';
      await notificationService.sendAlfredNudge(houseId, currentUserId, 'CHORE_DUE', {
        choreName: chore.title,
        action,
        assignedTo: chore.assignedTo ?? null,
      });
      Alert.alert('Alfred', 'Nudge sent.');
    } catch (error: any) {
      Alert.alert('Chores', error?.message || 'Unable to send nudge right now.');
    } finally {
      setNudgeSending(false);
    }
  };

  const renderStatusBadge = (chore: ChoreData, compact = false) => {
    const today = startOfDay(new Date());
    const dueDate = getDueDate(chore, today);
    const dueLabel = getDueLabel(dueDate);

    let label = chore.status === 'completed' ? 'Completed' : 'Pending';
    let backgroundColor = colors.accentSoft;
    let color = colors.accent;

    if (chore.status === 'completed') {
      backgroundColor = colors.successSoft;
      color = colors.success;
      if (dueLabel) {
        label = `Next ${dueLabel.toLowerCase()}`;
        backgroundColor = colors.infoSoft;
        color = colors.accent;
      }
    } else if (dueLabel?.startsWith('Overdue')) {
      label = dueLabel;
      backgroundColor = colors.dangerSoft;
      color = colors.danger;
    } else if (dueLabel) {
      label = dueLabel;
      backgroundColor = colors.warningSoft;
      color = colors.warning;
    }

    return (
      <View
        style={[
          styles.statusBadge,
          compact && styles.statusBadgeCompact,
          { backgroundColor },
        ]}
      >
        <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
      </View>
    );
  };

  const renderLastCompleted = (chore: ChoreData) => {
    if (!chore.lastCompletedAt || !chore.lastCompletedBy) return null;
    const lastByName = getAssignedName(chore.lastCompletedBy);
    return (
      <Text style={styles.lastCompletedText}>
        Last completed by {lastByName} - {chore.totalCompletions} time
        {chore.totalCompletions === 1 ? '' : 's'}
      </Text>
    );
  };

  const renderMissedInfo = (chore: ChoreData) => {
    const missedCount = chore.missedCount ?? 0;
    if (missedCount <= 0 || chore.status === 'completed') return null;
    const label = missedCount === 1 ? 'Missed 1 time' : `Missed ${missedCount} times`;
    return (
      <RNView style={styles.missedRow}>
        <RNView style={styles.missedBadge}>
          <Text style={styles.missedBadgeText}>{label}</Text>
        </RNView>
        <TouchableOpacity
          style={styles.missedReassignButton}
          onPress={() => openEditModal(chore)}
        >
          <Text style={styles.missedReassignText}>Edit</Text>
        </TouchableOpacity>
      </RNView>
    );
  };

  const renderHistoryMeta = (chore: ChoreData) => {
    if (!chore.lastCompletedAt || !chore.lastCompletedBy) return null;
    const completedBy = getAssignedName(chore.lastCompletedBy);
    return <Text style={styles.historyCompletedText}>Completed by {completedBy}</Text>;
  };

  const renderChoreCard = (item: ChoreData) => {
    const isPending = item.status === 'pending' || item.status === 'overdue';
    const assignedName = getAssignedName(item.assignedTo);
    const assignedMember = item.assignedTo
      ? members.find((member) => member.userId === item.assignedTo)
      : null;
    const assignedPhotoUrl = assignedMember?.photoUrl ?? null;
    const assignedInitial = getInitial(assignedMember?.name ?? assignedName);
    const assignedColor = item.assignedTo
      ? memberColorMap.get(item.assignedTo) ?? colors.accent
      : colors.accentMuted;
    const isUnassigned = !item.assignedTo;
    const dueDate = getDueDate(item, startOfDay(new Date()));
    const dueLabel = getDueLabel(dueDate);
    const today = startOfDay(new Date());
    const canNudge =
      !!currentUserId &&
      !!dueDate &&
      dueDate.getTime() <= today.getTime() &&
      !!item.assignedTo &&
      item.assignedTo !== currentUserId;
    const canComplete =
      isPending && (item.assignedTo === null || item.assignedTo === currentUserId);
    const isCompact = densityMode === 'compact';
    const isExpanded = !isCompact || expandedChoreIds.has(item.choreId);
    const showDescription = !!item.description && isExpanded;
    const isCompleted = item.status === 'completed';

    return (
      <View style={[styles.choreCard, isCompact && styles.choreCardCompact]}>
          <Pressable style={styles.choreTapArea}>
          <RNView
            style={[
              styles.choreHeaderRow,
              isCompact && styles.choreHeaderRowCompact,
              !showDescription && styles.choreHeaderRowNoDescription,
              isCompact && !showDescription && styles.choreHeaderRowCompactNoDescription,
            ]}
          >
            <RNView style={{ flex: 1 }}>
              <ExpandableTitle
                text={item.title}
                style={[
                  styles.choreTitle,
                  isCompact && styles.choreTitleCompact,
                  !showDescription && styles.choreTitleNoDescription,
                ]}
              />
              {showDescription && (
                <Text
                  style={[
                    styles.choreDescription,
                    isCompact && styles.choreDescriptionCompact,
                  ]}
                >
                  {item.description}
                </Text>
              )}
            </RNView>
            <RNView style={styles.choreHeaderRight}>
              {renderStatusBadge(item, isCompact)}
            </RNView>
          </RNView>

        {statusFilter !== 'history' ? (
          <>
            <RNView style={styles.choreMetaRow}>
              <RNView style={styles.choreMetaLeft}>
                <RNView
                  style={[
                    styles.assigneePill,
                    isCompact && styles.assigneePillCompact,
                    isUnassigned && styles.assigneePillMuted,
                  ]}
                >
                  {item.assignedTo ? (
                    <Pressable onPress={() => openProfileOverview(item.assignedTo!)}>
                      {assignedPhotoUrl ? (
                        <Image
                          source={{ uri: assignedPhotoUrl }}
                          style={styles.assigneeAvatar}
                          contentFit="cover"
                          cachePolicy="disk"
                          transition={150}
                        />
                      ) : (
                        <RNView
                          style={[styles.assigneeAvatar, { backgroundColor: assignedColor }]}
                        >
                          <Text style={styles.assigneeAvatarText}>{assignedInitial}</Text>
                        </RNView>
                      )}
                    </Pressable>
                  ) : (
                    <RNView style={[styles.assigneeAvatar, { backgroundColor: assignedColor }]}>
                      <Text style={styles.assigneeAvatarText}>{assignedInitial}</Text>
                    </RNView>
                  )}
                  <Text
                    style={[
                      styles.assigneePillText,
                      isCompact && styles.assigneePillTextCompact,
                      isUnassigned && styles.assigneePillTextMuted,
                    ]}
                  >
                    Assigned to{' '}
                    <Text
                      style={[
                        styles.assigneeNameText,
                        isUnassigned && styles.assigneePillTextMuted,
                      ]}
                    >
                      {assignedName}
                    </Text>
                  </Text>
                </RNView>
                <Text style={styles.choreMetaDivider}>|</Text>
                <RNView
                  style={[styles.difficultyPill, isCompact && styles.difficultyPillCompact]}
                >
                  <FontAwesome
                    name="signal"
                    size={isCompact ? 12 : 13}
                    color={colors.accent}
                    style={styles.difficultyIcon}
                  />
                  <Text style={[styles.difficultyText, isCompact && styles.difficultyTextCompact]}>
                    {item.points}/10
                  </Text>
                </RNView>
              </RNView>
            </RNView>
            {!isCompact && renderLastCompleted(item)}
            {!isCompact && renderMissedInfo(item)}
          </>
        ) : (
          <RNView style={styles.historyMetaRow}>{renderHistoryMeta(item)}</RNView>
        )}

          {isCompact && !!item.description && (
            <Pressable
              style={styles.compactDetailsToggle}
              onPress={() =>
                setExpandedChoreIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.choreId)) {
                    next.delete(item.choreId);
                  } else {
                    next.add(item.choreId);
                  }
                  return next;
                })
              }
            >
              <Text style={styles.compactDetailsToggleText}>
                {isExpanded ? 'Hide details' : 'Show details'}
              </Text>
            </Pressable>
          )}
        </Pressable>

        {canNudge && (
          <TouchableOpacity
            style={[styles.nudgeInlineButton, nudgeSending && styles.buttonDisabled]}
            onPress={() => {
              if (dueDate) {
                handleSendNudge(item, dueDate);
              }
            }}
            disabled={nudgeSending}
          >
            {nudgeSending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.nudgeInlineText}>Send nudge</Text>
            )}
          </TouchableOpacity>
        )}

          {(canComplete || !isCompleted) && (
            <RNView style={styles.completeRow}>
              {canComplete && (
                <TouchableOpacity
                  style={[styles.completeButton, isCompact && styles.completeButtonCompact]}
                  onPress={() => handleCompleteChore(item)}
                >
                  <Text style={styles.completeButtonText}>Complete</Text>
                </TouchableOpacity>
              )}
              {!isCompleted && (
                <Pressable
                  style={styles.menuTrigger}
                  onPress={() => openEditModal(item)}
                >
                  <FontAwesome name="ellipsis-h" size={16} color={colors.muted} />
                </Pressable>
              )}
            </RNView>
          )}
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) {
      return null;
    }

    const emptyCopy: Record<StatusFilter, { title: string; subtitle: string }> = {
      active: {
        title: 'No active chores',
        subtitle: 'Nothing due today. Check Upcoming to get ahead.',
      },
      upcoming: {
        title: 'No upcoming chores',
        subtitle: 'Set up recurring tasks to keep the house on track.',
      },
      history: {
        title: 'No completed chores yet',
        subtitle: 'Finish a task and it will show up here.',
      },
    };

    const copy = emptyCopy[statusFilter];

    return (
      <RNView style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateTitle}>{copy.title}</Text>
        <Text style={styles.emptyStateSubtitle}>{copy.subtitle}</Text>
        <TouchableOpacity style={styles.emptyStateButton} onPress={openCreateModal}>
          <Text style={styles.emptyStateButtonText}>Add a chore</Text>
        </TouchableOpacity>
      </RNView>
    );
  };

  const renderFairnessBar = () => {
    if (!isInHouse) return null;

    if (fairnessLoading && !memberStats.length) {
      return (
        <RNView style={styles.fairnessContainer}>
          <Text style={styles.sectionTitle}>House Fairness</Text>
          <ActivityIndicator color={colors.accent} />
        </RNView>
      );
    }

    if (!sortedFairnessStats.length || !fairnessRange) {
      return null;
    }

    return (
      <RNView style={styles.fairnessContainer}>
        <RNView style={styles.fairnessHeaderRow}>
          <Text style={styles.sectionTitle}>House Fairness</Text>
          <Pressable
            style={[
              styles.fairnessExpandButton,
              fairnessExpanded && styles.fairnessExpandButtonActive,
            ]}
            onPress={() => setFairnessExpanded((prev) => !prev)}
          >
            <Text
              style={[
                styles.fairnessExpandText,
                fairnessExpanded && styles.fairnessExpandTextActive,
              ]}
            >
              {fairnessExpanded ? 'Hide details' : 'Explain'}
            </Text>
          </Pressable>
        </RNView>
        {averagePoints !== null && (
          <Text style={styles.fairnessSubtitle}>
            Average ({fairnessWindowDays ?? ROLLING_WINDOW_DAYS} days):{' '}
            {Math.round(averagePoints)} pts
          </Text>
        )}

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
            const statusStyle =
              member.deviation >= 0 ? styles.fairnessDotPositive : styles.fairnessDotNegative;
            const dotStyle = [statusStyle, isCurrentUser && styles.fairnessDotCurrent];
            const photoUrl = memberPhotoMap.get(member.userId) ?? null;
            const fallbackColor = memberColorMap.get(member.userId) ?? colors.accent;
            const deviationLabel = `${member.deviation >= 0 ? '+' : ''}${Math.round(
              member.deviation
            )} vs avg`;
            return (
              <Pressable
                key={member.userId}
                style={[styles.fairnessDot, dotStyle, { left: `${position}%` }]}
                delayLongPress={60}
                onLongPress={() => setActiveFairnessUserId(member.userId)}
                onPressOut={() =>
                  setActiveFairnessUserId((current) =>
                    current === member.userId ? null : current
                  )
                }
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
                    style={[styles.fairnessAvatar, { backgroundColor: fallbackColor }]}
                  >
                    <Text style={styles.fairnessAvatarText}>
                      {getInitial(member.userName)}
                    </Text>
                  </RNView>
                )}
                {activeFairnessUserId === member.userId && (
                  <RNView style={styles.fairnessTooltip}>
                    <Text style={styles.fairnessTooltipName}>{member.userName}</Text>
                    <Text style={styles.fairnessTooltipValue}>{deviationLabel}</Text>
                  </RNView>
                )}
                {isCurrentUser && <RNView style={styles.fairnessYouBadge} />}
              </Pressable>
            );
          })}
        </RNView>
        <RNView style={styles.fairnessLegend}>
          <RNView style={styles.fairnessLegendItem}>
            <RNView style={[styles.fairnessLegendDot, styles.fairnessLegendBehind]} />
            <Text style={styles.fairnessLegendText}>Behind</Text>
          </RNView>
          <RNView style={styles.fairnessLegendItem}>
            <RNView style={[styles.fairnessLegendDot, styles.fairnessLegendYou]} />
            <Text style={styles.fairnessLegendText}>You</Text>
          </RNView>
          <RNView style={styles.fairnessLegendItem}>
            <RNView style={[styles.fairnessLegendDot, styles.fairnessLegendAhead]} />
            <Text style={styles.fairnessLegendText}>Ahead</Text>
          </RNView>
        </RNView>

        {fairnessExpanded && (
          <RNView style={styles.fairnessDetailCard}>
            <Text style={styles.fairnessDetailTitle}>How it balances right now</Text>
            <Text style={styles.fairnessDetailSubtitle}>
              Current points plus assigned chores show who is likely up next.
            </Text>

            {nextUpMember && (
              <RNView style={styles.fairnessDetailHighlight}>
                <Text style={styles.fairnessDetailHighlightLabel}>Likely next up</Text>
                <Text style={styles.fairnessDetailHighlightName}>
                  {nextUpMember.userName}
                </Text>
                <Text style={styles.fairnessDetailHighlightMeta}>
                  {Math.abs(Math.round(nextUpMember.projectedDeviation))} pts{' '}
                  {nextUpMember.projectedDeviation <= 0 ? 'behind' : 'ahead'} after
                  pending chores
                </Text>
              </RNView>
            )}

            {fairnessDetailRows.map((member) => {
              const isCurrentUser = member.userId === currentUserId;
              const photoUrl = memberPhotoMap.get(member.userId) ?? null;
              const fallbackColor = memberColorMap.get(member.userId) ?? colors.accent;
              const currentPct = Math.min(
                100,
                (Math.max(member.totalPoints, 0) / maxProjectedTotal) * 100
              );
              const pendingPct = Math.min(
                100 - currentPct,
                (Math.max(member.pendingPoints, 0) / maxProjectedTotal) * 100
              );
              const averagePct = Math.min(
                100,
                (Math.max(averageProjected, 0) / maxProjectedTotal) * 100
              );
              const deviationLabel = `${member.deviation >= 0 ? '+' : ''}${Math.round(
                member.deviation
              )} vs avg`;
              const projectedLabel = `${member.projectedDeviation >= 0 ? '+' : ''}${Math.round(
                member.projectedDeviation
              )} projected`;
              return (
                <RNView key={member.userId} style={styles.fairnessDetailRow}>
                  <RNView style={styles.fairnessDetailRowHeader}>
                    <RNView style={styles.fairnessDetailMember}>
                      {photoUrl ? (
                        <Image
                          source={{ uri: photoUrl }}
                          style={styles.fairnessDetailAvatar}
                          contentFit="cover"
                          cachePolicy="disk"
                          transition={150}
                        />
                      ) : (
                        <RNView
                          style={[
                            styles.fairnessDetailAvatar,
                            { backgroundColor: fallbackColor },
                          ]}
                        >
                          <Text style={styles.fairnessDetailAvatarText}>
                            {getInitial(member.userName)}
                          </Text>
                        </RNView>
                      )}
                      <Text style={styles.fairnessDetailName}>{member.userName}</Text>
                      {isCurrentUser && (
                        <Text style={styles.fairnessDetailYouTag}>You</Text>
                      )}
                    </RNView>
                    <Text style={styles.fairnessDetailScore}>
                      {Math.round(member.totalPoints)} pts
                    </Text>
                  </RNView>
                  <RNView style={styles.fairnessDetailBarTrack}>
                    <RNView
                      style={[styles.fairnessDetailBarCurrent, { width: `${currentPct}%` }]}
                    >
                      {currentPct >= 18 && (
                        <Text style={styles.fairnessDetailBarText}>
                          {Math.round(member.totalPoints)} pts
                        </Text>
                      )}
                    </RNView>
                    {pendingPct > 0 && (
                      <RNView
                        style={[
                          styles.fairnessDetailBarPending,
                          { width: `${pendingPct}%` },
                        ]}
                      >
                        {pendingPct >= 18 && (
                          <Text style={styles.fairnessDetailBarText}>
                            +{Math.round(member.pendingPoints)}
                          </Text>
                        )}
                      </RNView>
                    )}
                    <RNView
                      style={[
                        styles.fairnessDetailBarAverageMarker,
                        { left: `${averagePct}%` },
                      ]}
                    >
                      <Text style={styles.fairnessDetailBarAverageText}>avg</Text>
                    </RNView>
                  </RNView>
                  <RNView style={styles.fairnessDetailMetaRow}>
                    <Text style={styles.fairnessDetailMetaText}>{deviationLabel}</Text>
                    <Text style={styles.fairnessDetailMetaText}>
                      Pending {Math.round(member.pendingPoints)} pts
                    </Text>
                    <Text style={styles.fairnessDetailMetaText}>{projectedLabel}</Text>
                  </RNView>
                </RNView>
              );
            })}
          </RNView>
        )}
      </RNView>
    );
  };

  const renderFilters = () => (
    <RNView style={styles.controlsContainer}>
      <RNView style={styles.toggleRow}>
        {STATUS_FILTERS.map((filter) => (
          <Pressable
            key={filter.value}
            style={[
              styles.toggleButton,
              statusFilter === filter.value && styles.toggleButtonActive,
            ]}
            onPress={() => {
              selectionChanged();
              setStatusFilter(filter.value);
            }}
          >
            <Text
              style={[
                styles.toggleButtonText,
                statusFilter === filter.value && styles.toggleButtonTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </RNView>

      <RNView style={styles.filterActionsRow}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            selectionChanged();
            setSortByPointsDesc((prev) => !prev);
          }}
        >
          <Text style={styles.sortButtonText}>
            {statusFilter === 'history'
              ? 'Newest'
              : sortByPointsDesc
              ? 'Points ↑'
              : 'Points ↓'}
          </Text>
        </TouchableOpacity>
      </RNView>
    </RNView>
  );

  const renderStepIndicator = () => (
    <RNView style={styles.stepIndicatorRow}>
      {[1, 2, 3].map((step) => (
        <RNView
          key={step}
          style={[
            styles.stepDot,
            setupStep === step && styles.stepDotActive,
            setupStep > step && styles.stepDotComplete,
          ]}
        />
      ))}
    </RNView>
  );

  const renderModal = () => (
    <Modal
      visible={modalVisible}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <RNView style={styles.modalShell}>
          <RNView style={[styles.modalContent, { paddingBottom: 28 + insets.bottom }]}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>
              {editingChore ? 'Edit Chore' : 'Add Chore'}
            </Text>
            {editingChore && editingChore.frequency !== 'one-time' && (
              <Text style={styles.modalSubtitle}>
                Changes apply to future repeats only.
              </Text>
            )}
            {editingChore && (
              <RNView style={styles.instanceCard}>
                <Text style={styles.sectionHeader}>Current instance</Text>
                <Text style={styles.helperText}>
                  Update who is responsible for the next occurrence.
                </Text>
                <Text style={styles.modalLabel}>Assigned to</Text>
                <RNView style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[
                      styles.dropdownChip,
                      assignedToInput === null && styles.dropdownChipActive,
                    ]}
                    onPress={() => setAssignedToInput(null)}
                  >
                    <Text
                      style={[
                        styles.dropdownChipText,
                        assignedToInput === null && styles.dropdownChipTextActive,
                      ]}
                    >
                      Auto-assign
                    </Text>
                  </TouchableOpacity>
                  {members.map((member) => (
                    <TouchableOpacity
                      key={member.userId}
                      style={[
                        styles.dropdownChip,
                        assignedToInput === member.userId && styles.dropdownChipActive,
                      ]}
                      onPress={() => setAssignedToInput(member.userId)}
                    >
                      <Text
                        style={[
                          styles.dropdownChipText,
                          assignedToInput === member.userId &&
                            styles.dropdownChipTextActive,
                        ]}
                      >
                        {getFirstName(member.name, 'Housemate')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </RNView>

                <Text style={styles.modalLabel}>
                  {frequencyInput === 'one-time' ? 'Due date' : 'Next due date'}
                </Text>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowDueDatePicker((prev) => !prev);
                  }}
                >
                  <Text style={styles.datePickerText}>
                    {formatReadableDate(dueDateInput)}
                  </Text>
                </Pressable>
                {showDueDatePicker && (
                  <RNView style={styles.datePickerShell}>
                    <DateTimePicker
                      value={dueDateInput}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      themeVariant={
                        colorScheme === 'dark' ? 'dark' : 'light'
                      }
                      onChange={(_, selectedDate) => {
                        if (selectedDate) {
                          setDueDateInput(startOfDay(selectedDate));
                        }
                      }}
                    />
                  </RNView>
                )}
              </RNView>
            )}
            {!editingChore && renderStepIndicator()}

            {(editingChore || setupStep === 1) && (
              <>
                {editingChore && (
                  <Text style={styles.sectionHeader}>Series details</Text>
                )}
                {!editingChore && (
                  <>
                    <Text style={styles.modalLabel}>Templates</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.templateRow}
                    >
                      {CHORE_TEMPLATES.map((template) => (
                        <Pressable
                          key={template.id}
                          style={styles.templateChip}
                          onPress={() => {
                            setTitleInput(template.title);
                            setDescriptionInput(template.description ?? '');
                            setPointsInput(template.points);
                            setFrequencyInput(template.frequency);
                            setDueDateInput(startOfDay(new Date()));
                          }}
                        >
                          <Text style={styles.templateChipText}>{template.title}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.modalLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Fold laundry"
                  placeholderTextColor={colors.muted}
                  value={titleInput}
                  onChangeText={setTitleInput}
                  onFocus={() => setShowDueDatePicker(false)}
                />

                <Text style={styles.modalLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Include any helpful details"
                  placeholderTextColor={colors.muted}
                  multiline
                  value={descriptionInput}
                  onChangeText={setDescriptionInput}
                  onFocus={() => setShowDueDatePicker(false)}
                />

                <Text style={styles.modalLabel}>Frequency</Text>
                <RNView style={styles.dropdownContainer}>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownChip,
                        frequencyInput === option.value && styles.dropdownChipActive,
                      ]}
                      onPress={() => setFrequencyInput(option.value)}
                    >
                      <Text
                        style={[
                          styles.dropdownChipText,
                          frequencyInput === option.value &&
                            styles.dropdownChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </RNView>

                {frequencyInput === 'daily' && (
                  <>
                    <Text style={styles.modalLabel}>Assignment</Text>
                    <RNView style={styles.assignmentToggleRow}>
                      <Pressable
                        style={[
                          styles.assignmentToggleButton,
                          assignmentModeInput === 'fair' && styles.assignmentToggleActive,
                        ]}
                        onPress={() => handleSelectAssignmentMode('fair')}
                      >
                        <Text
                          style={[
                            styles.assignmentToggleText,
                            assignmentModeInput === 'fair' && styles.assignmentToggleTextActive,
                          ]}
                        >
                          Fair rotation
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.assignmentToggleButton,
                          assignmentModeInput === 'weeklyLock' &&
                            styles.assignmentToggleActive,
                        ]}
                        onPress={() => handleSelectAssignmentMode('weeklyLock')}
                      >
                        <RNView style={styles.assignmentToggleLabel}>
                          <Text
                            style={[
                              styles.assignmentToggleText,
                              assignmentModeInput === 'weeklyLock' &&
                                styles.assignmentToggleTextActive,
                            ]}
                          >
                            Weekly role lock
                          </Text>
                          {!isPremiumHouse && (
                            <RNView style={styles.premiumTag}>
                              <FontAwesome
                                name="lock"
                                size={10}
                                color={styles.premiumTagText.color}
                              />
                              <Text style={styles.premiumTagText}>Premium</Text>
                            </RNView>
                          )}
                        </RNView>
                      </Pressable>
                    </RNView>
                    <Text style={styles.helperText}>
                      Weekly role lock keeps the same person for a week, then reassigns fairly.
                    </Text>
                  </>
                )}

                {!editingChore && (
                  <>
                    <Text style={styles.modalLabel}>
                      {frequencyInput === 'one-time' ? 'Due date' : 'First due date'}
                    </Text>
                    <Pressable
                      style={styles.datePickerButton}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowDueDatePicker((prev) => !prev);
                      }}
                    >
                      <Text style={styles.datePickerText}>
                        {formatReadableDate(dueDateInput)}
                      </Text>
                    </Pressable>
                    {showDueDatePicker && (
                      <RNView style={styles.datePickerShell}>
                        <DateTimePicker
                          value={dueDateInput}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          themeVariant={
                            Platform.OS === 'ios'
                              ? colorScheme === 'dark'
                                ? 'dark'
                                : 'light'
                              : undefined
                          }
                          textColor={Platform.OS === 'ios' ? colors.accent : undefined}
                          onChange={(_, date) => {
                            if (date) {
                              setDueDateInput(startOfDay(date));
                            }
                          }}
                        />
                      </RNView>
                    )}
                  </>
                )}
              </>
            )}

            {(editingChore || setupStep === 2) && (
              <>
                <Text style={styles.modalLabel}>Difficulty (1-10)</Text>
                <Text style={styles.helperText}>
                  Higher number means more effort and more credit toward fairness.
                </Text>
                <RNView style={styles.sliderRow}>
                  <Text style={styles.sliderValue}>{pointsInput}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={10}
                    step={1}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.border}
                    thumbTintColor={colors.accent}
                    value={pointsInput}
                    onValueChange={setPointsInput}
                  />
                </RNView>

                {!editingChore && (
                  <>
                    <Text style={styles.modalLabel}>Assign to</Text>
                    <RNView style={styles.dropdownContainer}>
                      <TouchableOpacity
                        style={[
                          styles.dropdownChip,
                          assignedToInput === null && styles.dropdownChipActive,
                        ]}
                        onPress={() => setAssignedToInput(null)}
                      >
                        <Text
                          style={[
                            styles.dropdownChipText,
                            assignedToInput === null && styles.dropdownChipTextActive,
                          ]}
                        >
                          Auto-assign
                        </Text>
                      </TouchableOpacity>
                      {members.map((member) => (
                        <TouchableOpacity
                          key={member.userId}
                          style={[
                            styles.dropdownChip,
                            assignedToInput === member.userId &&
                              styles.dropdownChipActive,
                          ]}
                          onPress={() => setAssignedToInput(member.userId)}
                        >
                          <Text
                            style={[
                              styles.dropdownChipText,
                              assignedToInput === member.userId &&
                                styles.dropdownChipTextActive,
                            ]}
                          >
                            {member.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </RNView>
                  </>
                )}
                <Text style={styles.modalLabel}>Eligible housemates</Text>
                <RNView style={styles.dropdownContainer}>
                  {members.map((member) => {
                    const isSelected = isPremiumHouse
                      ? eligibleAssigneesInput.includes(member.userId)
                      : true;
                    return (
                      <TouchableOpacity
                        key={member.userId}
                        style={[
                          styles.dropdownChip,
                          isSelected && styles.dropdownChipActive,
                          !isPremiumHouse && styles.dropdownChipDisabled,
                        ]}
                        onPress={() => handleToggleEligible(member.userId)}
                        disabled={!isPremiumHouse}
                      >
                        <RNView style={styles.dropdownChipContent}>
                          {isSelected && (
                            <FontAwesome
                              name="check"
                              size={12}
                              color={
                                isSelected
                                  ? styles.dropdownChipTextActive.color
                                  : styles.dropdownChipText.color
                              }
                              style={styles.dropdownChipIcon}
                            />
                          )}
                          <Text
                            style={[
                              styles.dropdownChipText,
                              isSelected && styles.dropdownChipTextActive,
                            ]}
                          >
                            {getFirstName(member.name, 'Housemate')}
                          </Text>
                        </RNView>
                      </TouchableOpacity>
                    );
                  })}
                </RNView>
                {!isPremiumHouse && (
                  <RNView style={styles.premiumHelperRow}>
                    <FontAwesome name="lock" size={12} color={styles.premiumHelperText.color} />
                    <Text style={styles.premiumHelperText}>
                      Premium to customize assignment pool.
                    </Text>
                  </RNView>
                )}
                {isPremiumHouse && eligibleAssigneesInput.length === 1 && (
                  <Text style={styles.warningText}>
                    Only one person selected. They will get this chore every time.
                  </Text>
                )}
              </>
            )}

            {!editingChore && setupStep === 3 && (
              <RNView style={styles.reviewCard}>
                <Text style={styles.reviewTitle}>Quick check</Text>
                <RNView style={styles.reviewRow}>
                  <FontAwesome name="tag" size={14} color={colors.accent} />
                <Text style={styles.reviewValue} numberOfLines={1}>
                  {titleInput.trim() || 'Untitled'}
                </Text>
                </RNView>
                <RNView style={styles.reviewRow}>
                  <FontAwesome name="repeat" size={14} color={colors.accent} />
                  <Text style={styles.reviewValue}>{frequencyInput}</Text>
                </RNView>
                <RNView style={styles.reviewRow}>
                  <FontAwesome name="calendar" size={14} color={colors.accent} />
                  <Text style={styles.reviewValue}>
                    {formatReadableDate(dueDateInput)}
                  </Text>
                </RNView>
                <RNView style={styles.reviewRow}>
                  <FontAwesome name="signal" size={14} color={colors.accent} />
                  <Text style={styles.reviewValue}>{pointsInput}/10</Text>
                </RNView>
                <RNView style={styles.reviewRow}>
                  <FontAwesome name="user" size={14} color={colors.accent} />
                  <Text style={styles.reviewValue}>
                    {getAssignedName(assignedToInput)}
                  </Text>
                </RNView>
                {!!descriptionInput.trim() && (
                  <RNView style={styles.reviewRow}>
                    <FontAwesome name="sticky-note" size={14} color={colors.accent} />
                    <Text style={styles.reviewValue} numberOfLines={2}>
                      {descriptionInput.trim()}
                    </Text>
                  </RNView>
                )}
              </RNView>
            )}

            <RNView style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={closeModal}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              {editingChore && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalDangerButton]}
                  onPress={() => {
                    if (!editingChore) return;
                    closeModal();
                    handleDeleteChore(editingChore);
                  }}
                  disabled={submitting}
                >
                  <Text style={styles.modalDangerText}>Delete</Text>
                </TouchableOpacity>
              )}
              {!editingChore && setupStep > 1 && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSecondaryButton]}
                  onPress={() => setSetupStep((prev) => Math.max(1, prev - 1))}
                  disabled={submitting}
                >
                  <Text style={styles.modalSecondaryText}>Back</Text>
                </TouchableOpacity>
              )}
              {!editingChore && setupStep < 3 && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={handleStepAdvance}
                  disabled={submitting}
                >
                  <Text style={styles.modalPrimaryText}>Next</Text>
                </TouchableOpacity>
              )}
              {(editingChore || setupStep === 3) && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                  <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.modalPrimaryText}>
                      {editingChore ? 'Save changes' : 'Add chore'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </RNView>
          </ScrollView>
          </RNView>
        </RNView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );

  if (!isInHouse) {
    return (
      <ScreenShell>
        <RNView style={styles.centeredMessage}>
          <Text style={styles.title}>Join or create a house</Text>
          <Text style={styles.description}>
            Chores live inside a house. Once you join or create a house, you'll see all shared
            chores here.
          </Text>
        </RNView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={styles.container}>
      <Animated.FlatList
        data={groupedItems}
        keyExtractor={(item) =>
          item.type === 'header' ? `header-${item.title}` : `chore-${item.chore.choreId}`
        }
        contentContainerStyle={styles.listContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <RNView>
            <Text style={styles.title}>Chores</Text>
            {renderFairnessBar()}
            {renderFilters()}
            <Text style={styles.listSubtitle}>
              {statusFilter === 'active'
                ? 'Due now and overdue tasks.'
                : statusFilter === 'upcoming'
                ? 'Planned chores coming up next.'
                : 'Completed chores history.'}
            </Text>
          </RNView>
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <RNView style={styles.groupHeader}>
              <Text style={styles.groupHeaderText}>{item.title}</Text>
            </RNView>
          ) : (
            renderChoreCard(item.chore)
          )
        }
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openCreateModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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
        <Text style={styles.stickyHeaderTitle}>Chores</Text>
      </Animated.View>

      <ProfileOverviewModal
        visible={profileVisible}
        user={selectedProfile}
        onClose={() => setProfileVisible(false)}
      />

      {renderModal()}

      {loading && (
        <RNView style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
        </RNView>
      )}
    </ScreenShell>
  );
}

const createStyles = (colors: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 24,
    paddingBottom: 160,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
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
  description: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 20,
  },
  listSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  choreCard: {
    backgroundColor: colors.card,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  choreCardCompact: {
    padding: 12,
    marginBottom: 8,
  },
  choreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  choreHeaderRowCompact: {
    marginBottom: 6,
  },
  choreHeaderRowNoDescription: {
    marginBottom: 4,
  },
  choreHeaderRowCompactNoDescription: {
    marginBottom: 2,
  },
  choreHeaderRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  choreHeaderRightCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  choreTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  choreTitleNoDescription: {
    marginBottom: 0,
  },
  choreTitleCompact: {
    fontSize: 15,
  },
  choreDescription: {
    fontSize: 14,
    color: colors.muted,
  },
  choreDescriptionCompact: {
    fontSize: 12,
  },
  choreMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  choreMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  choreMetaText: {
    fontSize: 13,
    color: colors.muted,
  },
  choreMetaTextCompact: {
    fontSize: 12,
  },
  choreMetaDivider: {
    fontSize: 13,
    color: colors.muted,
    marginHorizontal: 6,
  },
  assigneePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assigneePillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  assigneePillMuted: {
    backgroundColor: colors.surface,
  },
  assigneeAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  assigneeAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onAccent,
  },
  assigneePillText: {
    fontSize: 12,
    color: colors.accent,
  },
  assigneePillTextCompact: {
    fontSize: 11,
  },
  assigneePillTextMuted: {
    color: colors.muted,
  },
  assigneeNameText: {
    fontWeight: '600',
    color: colors.accent,
  },
  difficultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  difficultyPillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  difficultyIcon: {
    marginRight: 6,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  difficultyTextCompact: {
    fontSize: 11,
  },
  lastCompletedText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  missedRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  missedBadge: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  missedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.warning,
  },
  missedReassignButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missedReassignText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  historyMetaRow: {
    marginTop: 6,
  },
  historyCompletedText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  choreDueText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  choreDueTextCompact: {
    fontSize: 11,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  statusBadgeCompact: {
    marginBottom: 0,
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  completeButton: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  completeButtonCompact: {
    paddingVertical: 8,
  },
  completeButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 15,
  },
  completeRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuTrigger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  nudgeInlineButton: {
    marginTop: 8,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  nudgeInlineText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 13,
  },
  compactDetailsToggle: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  compactDetailsToggleText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  choreTapArea: {
    width: '100%',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  emptyStateButton: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyStateButtonText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  groupHeader: {
    marginTop: 4,
    marginBottom: 8,
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 112,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: colors.onAccent,
    fontSize: 30,
    lineHeight: 32,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fairnessContainer: {
    backgroundColor: colors.card,
    borderRadius: BORDER_RADIUS,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fairnessHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  fairnessExpandButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  fairnessExpandButtonActive: {
    backgroundColor: colors.accent,
  },
  fairnessExpandText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  fairnessExpandTextActive: {
    color: colors.onAccent,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  fairnessSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  fairnessScale: {
    height: 46,
    justifyContent: 'center',
    marginBottom: 8,
  },
  fairnessTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fairnessAverageMarker: {
    position: 'absolute',
    width: 2,
    height: 18,
    backgroundColor: colors.accent,
    top: '50%',
    transform: [{ translateY: -9 }],
  },
  fairnessDot: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -14,
    transform: [{ translateY: -14 }],
  },
  fairnessDotPositive: {
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: colors.card,
  },
  fairnessDotNegative: {
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  fairnessDotCurrent: {
    borderWidth: 3,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fairnessAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fairnessYouBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.card,
  },
  fairnessAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onAccent,
  },
  fairnessTooltip: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    transform: [{ translateX: -90 }],
    minWidth: 180,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    zIndex: 20,
  },
  fairnessTooltipName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  fairnessTooltipValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  fairnessLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  fairnessLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fairnessLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: colors.card,
    marginRight: 6,
  },
  fairnessLegendBehind: {
    borderColor: colors.danger,
  },
  fairnessLegendAhead: {
    borderColor: colors.success,
  },
  fairnessLegendYou: {
    borderColor: colors.accent,
  },
  fairnessLegendText: {
    fontSize: 11,
    color: colors.muted,
  },
  fairnessDetailCard: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fairnessDetailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  fairnessDetailSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 10,
  },
  fairnessDetailHighlight: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.accentSoft,
    marginBottom: 12,
  },
  fairnessDetailHighlightLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 2,
  },
  fairnessDetailHighlightName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  fairnessDetailHighlightMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  fairnessDetailRow: {
    marginBottom: 12,
  },
  fairnessDetailRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fairnessDetailMember: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fairnessDetailAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fairnessDetailAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onAccent,
  },
  fairnessDetailName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  fairnessDetailYouTag: {
    marginLeft: 6,
    fontSize: 10,
    fontWeight: '700',
    color: colors.onAccent,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  fairnessDetailScore: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  fairnessDetailBarTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.panel,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fairnessDetailBarCurrent: {
    height: '100%',
    backgroundColor: colors.accent,
    justifyContent: 'center',
    paddingLeft: 6,
  },
  fairnessDetailBarPending: {
    height: '100%',
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    paddingLeft: 6,
  },
  fairnessDetailBarText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onAccent,
  },
  fairnessDetailBarAverageMarker: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 2,
    backgroundColor: colors.accent,
  },
  fairnessDetailBarAverageText: {
    position: 'absolute',
    top: -18,
    left: 6,
    fontSize: 10,
    color: colors.muted,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  fairnessDetailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  fairnessDetailMetaText: {
    fontSize: 11,
    color: colors.muted,
  },
  controlsContainer: {
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleButtonText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: colors.onAccent,
  },
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  sortButtonText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
  densityToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  densityOption: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  densityOptionActive: {
    backgroundColor: colors.accent,
  },
  densityOptionText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  densityOptionTextActive: {
    color: colors.onAccent,
  },
  assignmentToggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assignmentToggleButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  assignmentToggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assignmentToggleActive: {
    backgroundColor: colors.accent,
  },
  assignmentToggleText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  assignmentToggleTextActive: {
    color: colors.onAccent,
  },
  premiumTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.warningSoft,
  },
  premiumTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
    marginLeft: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalShell: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 4,
  },
  instanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 14,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
    marginTop: 8,
  },
  templateRow: {
    paddingVertical: 4,
    paddingRight: 6,
  },
  templateChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  datePickerButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.accentSoft,
  },
  datePickerText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
  },
  datePickerShell: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.accentSoft,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderValue: {
    width: 32,
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginRight: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentSoft,
    marginRight: 6,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
  },
  stepDotComplete: {
    backgroundColor: colors.infoSoft,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewValue: {
    fontSize: 13,
    color: colors.accent,
    flex: 1,
    marginLeft: 10,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.accent,
    backgroundColor: colors.card,
  },
  inputMultiline: {
    height: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginTop: 4,
  },
  rowItem: {
    flex: 1,
  },
  dropdownContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  dropdownChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
    marginRight: 8,
    marginBottom: 6,
  },
  dropdownChipDisabled: {
    opacity: 0.6,
  },
  dropdownChipActive: {
    backgroundColor: colors.accent,
  },
  dropdownChipText: {
    fontSize: 13,
    color: colors.muted,
  },
  dropdownChipTextActive: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  dropdownChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownChipIcon: {
    marginRight: 6,
  },
  premiumHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  premiumHelperText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
    marginLeft: 6,
  },
  warningText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
    marginTop: 4,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginLeft: 8,
  },
  modalCancelButton: {
    backgroundColor: colors.accentSoft,
  },
  modalSecondaryButton: {
    backgroundColor: colors.accentSoft,
  },
  modalDangerButton: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  modalPrimaryButton: {
    backgroundColor: colors.accent,
  },
  modalCancelText: {
    color: colors.accent,
    fontWeight: '500',
  },
  modalSecondaryText: {
    color: colors.accent,
    fontWeight: '600',
  },
  modalDangerText: {
    color: colors.danger,
    fontWeight: '700',
  },
  modalPrimaryText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
});


