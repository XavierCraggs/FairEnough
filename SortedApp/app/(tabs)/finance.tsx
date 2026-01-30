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
} from 'react-native';
import { Text } from '@/components/Themed';
import { useAuth } from '../../contexts/AuthContext';
import financeService, {
  FinanceServiceError,
  SettlementData,
  SimplifiedDebt,
  TransactionData,
} from '../../services/financeService';
import notificationService from '../../services/notificationService';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import {
  impactLight,
  impactMedium,
  notifyError,
  notifySuccess,
  notifyWarning,
} from '@/utils/haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';
import ScreenShell from '@/components/ScreenShell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams } from 'expo-router';
import { getFirstName } from '@/utils/name';
import { Image } from 'expo-image';
import ExpandableTitle from '@/components/ExpandableTitle';
import ProfileOverviewModal, {
  ProfileOverviewUser,
} from '@/components/ProfileOverviewModal';

const BORDER_RADIUS = 16;
const CONTEST_REASONS = [
  'I was not part of this expense',
  'Amount looks wrong',
  'Split should be different',
  'Other',
];

interface MemberOption {
  userId: string;
  name: string;
  fullName?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  totalPoints?: number;
  createdAt?: any;
}

export default function FinanceScreen() {
  const { user, userProfile, activeHouseId } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { focusTransactionId, openCreate } = useLocalSearchParams<{
    focusTransactionId?: string;
    openCreate?: string;
  }>();
  const scrollY = useRef(new Animated.Value(0));
  const quickStartOpenedRef = useRef(false);
  const headerOpacity = scrollY.current.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.92],
    extrapolate: 'clamp',
  });
  const houseId = activeHouseId ?? null;
  const currentUserId = user?.uid ?? null;

  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [debts, setDebts] = useState<SimplifiedDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [settlements, setSettlements] = useState<SettlementData[]>([]);
  const [profileVisible, setProfileVisible] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionData | null>(
    null
  );
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [detailsInput, setDetailsInput] = useState('');
  const [splitWithInput, setSplitWithInput] = useState<string[]>([]);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [debtDetailVisible, setDebtDetailVisible] = useState(false);
  const [transactionDetailVisible, setTransactionDetailVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(
    null
  );
  const [contestVisible, setContestVisible] = useState(false);
  const [contestingTransaction, setContestingTransaction] =
    useState<TransactionData | null>(null);
  const [contestReason, setContestReason] = useState(CONTEST_REASONS[0]);
  const [contestNote, setContestNote] = useState('');
  const [highlightTransactionId, setHighlightTransactionId] = useState<string | null>(
    null
  );

  const isInHouse = !!houseId;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      map.set(member.userId, member.name);
    });
    return map;
  }, [members]);

  const memberFullNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      if (member.fullName) {
        map.set(member.userId, member.fullName);
      }
    });
    return map;
  }, [members]);

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

  const getMemberName = useCallback(
    (userId: string, fallback?: string) =>
      getFirstName(memberNameMap.get(userId) || fallback || 'Unknown', 'Unknown'),
    [memberNameMap]
  );

  const getMemberFullName = useCallback(
    (userId: string, fallback?: string) =>
      memberFullNameMap.get(userId) || fallback || memberNameMap.get(userId) || 'Housemate',
    [memberFullNameMap, memberNameMap]
  );

  const openProfileOverview = useCallback((userId: string) => {
    setSelectedProfileId(userId);
    setProfileVisible(true);
  }, []);

  const selectedProfile = useMemo<ProfileOverviewUser | null>(() => {
    if (!selectedProfileId) return null;
    const name = getMemberFullName(selectedProfileId);
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
      photoUrl: memberPhotoMap.get(selectedProfileId) ?? null,
      email: memberEmailMap.get(selectedProfileId) ?? null,
      subtitle: 'Housemate',
      stats,
    };
  }, [
    selectedProfileId,
    getMemberFullName,
    memberPhotoMap,
    memberEmailMap,
    memberPointsMap,
    memberCreatedMap,
  ]);

  const formatCurrency = useCallback((amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `$${safeAmount.toFixed(2)}`;
  }, []);

  const formatSignedCurrency = useCallback(
    (amount: number) => {
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const sign = safeAmount < 0 ? '-' : '+';
      return `${sign}${formatCurrency(Math.abs(safeAmount))}`;
    },
    [formatCurrency]
  );

  const formatDateTime = useCallback((value: any) => {
    if (value?.toDate) {
      return value.toDate().toLocaleString();
    }
    return 'Just now';
  }, []);

  const getInitial = (name: string) => (name.trim() ? name.trim()[0].toUpperCase() : '?');

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

  const splitDescription = (value: string) => {
    const parts = (value || '').split(' - ');
    if (parts.length > 1) {
      return { title: parts[0], details: parts.slice(1).join(' - ') };
    }
    return { title: value, details: '' };
  };

  const buildEqualSplit = (amount: number, ids: string[]) => {
    if (!ids.length) return {};
    const cents = Math.round(amount * 100);
    const base = Math.floor(cents / ids.length);
    const remainder = cents % ids.length;
    return ids.reduce<Record<string, number>>((acc, id, index) => {
      const shareCents = base + (index < remainder ? 1 : 0);
      acc[id] = shareCents / 100;
      return acc;
    }, {});
  };

  const roundCurrency = (value: number) => Math.round(value * 100) / 100;

  const computeSplitValues = useCallback(
    (transaction: TransactionData) => {
      const splitWith = transaction.splitWith || [];
      if (!splitWith.length) return {};
      const amount = Number(transaction.amount) || 0;
      if (!amount) return {};

      if (transaction.splitAmounts) {
        const totalSplit = splitWith.reduce((sum, memberId) => {
          const value = Number(transaction.splitAmounts?.[memberId]);
          if (!Number.isFinite(value)) {
            return sum;
          }
          return sum + value;
        }, 0);

        if (totalSplit > 0) {
          const scale = Math.abs(totalSplit - amount) > 0.01 ? amount / totalSplit : 1;
          return splitWith.reduce<Record<string, number>>((acc, memberId) => {
            const value = Number(transaction.splitAmounts?.[memberId]);
            acc[memberId] = Number.isFinite(value) ? roundCurrency(value * scale) : 0;
            return acc;
          }, {});
        }
      }

      const share = amount / splitWith.length;
      return splitWith.reduce<Record<string, number>>((acc, memberId) => {
        acc[memberId] = roundCurrency(share);
        return acc;
      }, {});
    },
    []
  );

  const getTransactionPaymentStatus = useCallback(
    (transaction: TransactionData) => {
      const splitValues = computeSplitValues(transaction);
      const participants = (transaction.splitWith || []).filter(
        (memberId) => (splitValues[memberId] ?? 0) > 0.009
      );
      let totalDue = 0;
      let totalPaid = 0;

      participants.forEach((memberId) => {
        const share = splitValues[memberId] ?? 0;
        totalDue += share;
        const paid =
          memberId === transaction.payerId
            ? share
            : Number(transaction.paidBy?.[memberId]) || 0;
        const paidClamped = Math.min(share, paid);
        totalPaid += paidClamped;
      });

      const roundedDue = roundCurrency(totalDue);
      const roundedPaid = roundCurrency(totalPaid);
      const isPaid =
        participants.length > 0 && roundedPaid >= roundedDue - 0.01;

      return {
        isPaid,
        totalParticipants: participants.length,
        totalDue: roundedDue,
        totalPaid: roundedPaid,
        splitValues,
      };
    },
    [computeSplitValues]
  );

  const getAgeInDays = useCallback((value: any) => {
    if (!value?.toDate) return 0;
    const createdAt = value.toDate();
    const diffMs = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, []);

  const getUrgencyTone = useCallback(
    (ageDays: number) => {
      if (ageDays >= 7) {
        return {
          label: `Overdue ${ageDays}d`,
          color: colors.danger,
          background: colors.dangerSoft,
        };
      }
      if (ageDays >= 3) {
        return {
          label: `Aging ${ageDays}d`,
          color: colors.warning,
          background: colors.warningSoft,
        };
      }
      return { label: 'New', color: colors.accent, background: colors.accentSoft };
    },
    [colors]
  );

  useEffect(() => {
    if (!houseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = financeService.subscribeToTransactions(
      houseId,
      (updated) => {
        setTransactions(updated);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  useEffect(() => {
    if (!houseId) {
      setSettlements([]);
      return;
    }

    const unsubscribe = financeService.subscribeToSettlements(
      houseId,
      (updated) => {
        setSettlements(updated);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  useEffect(() => {
    if (!houseId) {
      return;
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('houseId', '==', houseId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedMembers: MemberOption[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            userId: docSnap.id,
            name: getFirstName(data.name || 'Unnamed', 'Unnamed'),
            fullName: data.name || null,
            photoUrl: data.photoUrl || data.photoURL || null,
            email: data.email || null,
            totalPoints: typeof data.totalPoints === 'number' ? data.totalPoints : 0,
            createdAt: data.createdAt || null,
          };
        });
        setMembers(loadedMembers);
      },
      () => {
        setMembers([]);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  const loadDebts = useCallback(async () => {
    if (!houseId) return;
    try {
      setDebtsLoading(true);
      const data = await financeService.calculateDebts(houseId);
      setDebts(data);
    } catch (err: any) {
      const message =
        (err as FinanceServiceError)?.message ?? 'Unable to calculate debts.';
      Alert.alert('Finance', message);
    } finally {
      setDebtsLoading(false);
    }
  }, [houseId]);

  useEffect(() => {
    if (!houseId) return;
    loadDebts();
  }, [houseId, loadDebts, transactions, settlements]);

  const handleError = useCallback((err: any, fallbackMessage: string) => {
    const serviceError = err as FinanceServiceError;
    const message = serviceError?.message || fallbackMessage;
    Alert.alert('Finance', message);
  }, []);

  const openCreateModal = () => {
    if (!currentUserId) {
      Alert.alert('Finance', 'You must be signed in to add a transaction.');
      return;
    }
    setEditingTransaction(null);
    setAmountInput('');
    setDescriptionInput('');
    setDetailsInput('');
    const defaultSplit = Array.from(
      new Set([...members.map((member) => member.userId), currentUserId])
    );
    setSplitWithInput(defaultSplit);
    setModalStep(1);
    setSplitMode('equal');
    setCustomSplits({});
    impactLight();
    setModalVisible(true);
  };

  useEffect(() => {
    if (openCreate !== '1') return;
    if (quickStartOpenedRef.current) return;
    quickStartOpenedRef.current = true;
    openCreateModal();
  }, [openCreate]);

  const openEditModal = (transaction: TransactionData) => {
    if (!currentUserId) {
      Alert.alert('Finance', 'You must be signed in to edit a transaction.');
      return;
    }
    setEditingTransaction(transaction);
    setAmountInput(String(transaction.amount));
    const parsed = splitDescription(transaction.description);
    setDescriptionInput(parsed.title);
    setDetailsInput(parsed.details);
    const defaultSplit = Array.from(
      new Set([...(transaction.splitWith || []), currentUserId])
    );
    setSplitWithInput(defaultSplit);
    if (transaction.splitAmounts) {
      const preset: Record<string, string> = {};
      Object.entries(transaction.splitAmounts).forEach(([key, value]) => {
        preset[key] = Number.isFinite(value) ? value.toFixed(2) : '';
      });
      setCustomSplits(preset);
      setSplitMode('custom');
    } else {
      setCustomSplits({});
      setSplitMode('equal');
    }
    setModalStep(1);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setModalStep(1);
  };

  const toggleSplitMember = (memberId: string) => {
    setSplitWithInput((current) => {
      let next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      if (currentUserId && !next.includes(currentUserId)) {
        next = [...next, currentUserId];
      }
      return next;
    });
  };

  const totalAmount = useMemo(() => {
    const amount = Number(amountInput);
    return Number.isFinite(amount) ? amount : 0;
  }, [amountInput]);

  const selectedSplitIds = useMemo(() => splitWithInput, [splitWithInput]);

  const equalSplitAmounts = useMemo(
    () => buildEqualSplit(totalAmount, selectedSplitIds),
    [totalAmount, selectedSplitIds]
  );

  useEffect(() => {
    if (splitMode !== 'custom') return;
    if (!selectedSplitIds.length) return;
    setCustomSplits((current) => {
      const next = { ...current };
      selectedSplitIds.forEach((id) => {
        if (typeof next[id] === 'undefined') {
          const fallback = equalSplitAmounts[id] ?? 0;
          next[id] = fallback ? fallback.toFixed(2) : '';
        }
      });
      Object.keys(next).forEach((id) => {
        if (!selectedSplitIds.includes(id)) {
          delete next[id];
        }
      });
      return next;
    });
  }, [splitMode, selectedSplitIds, equalSplitAmounts]);

  const resolvedSplitAmounts = useMemo(() => {
    if (splitMode === 'equal') {
      return equalSplitAmounts;
    }

    return selectedSplitIds.reduce<Record<string, number>>((acc, id) => {
      const value = Number(customSplits[id]);
      acc[id] = Number.isFinite(value) ? value : 0;
      return acc;
    }, {});
  }, [splitMode, equalSplitAmounts, customSplits, selectedSplitIds]);

  const totalSplitAmount = useMemo(
    () =>
      Object.values(resolvedSplitAmounts).reduce((sum, value) => sum + value, 0),
    [resolvedSplitAmounts]
  );

  const isCustomSplitValid = useMemo(() => {
    if (splitMode !== 'custom') return true;
    return Math.abs(totalSplitAmount - totalAmount) <= 0.01;
  }, [splitMode, totalSplitAmount, totalAmount]);

  const handleSubmit = async () => {
    if (!houseId || !currentUserId) {
      return;
    }

    const amount = Number(amountInput);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert('Finance', 'Please enter a valid amount (0 or more).');
      return;
    }

    if (!splitWithInput.length) {
      Alert.alert('Finance', 'Please select at least one member to split with.');
      return;
    }

    const finalSplit = Array.from(new Set([...splitWithInput, currentUserId]));
    const title = descriptionInput.trim() || 'Shared expense';
    const details = detailsInput.trim();
    const description = details ? `${title} - ${details}` : title;

    let splitAmounts: Record<string, number> | null | undefined;
    if (splitMode === 'custom') {
      if (!isCustomSplitValid) {
        Alert.alert('Finance', 'Split amounts must add up to the total.');
        return;
      }
      splitAmounts = finalSplit.reduce<Record<string, number>>((acc, id) => {
        const value = Number(customSplits[id]);
        acc[id] = Number.isFinite(value) ? value : 0;
        return acc;
      }, {});
    } else if (editingTransaction?.splitAmounts) {
      splitAmounts = null;
    }

    setSubmitting(true);
    try {
      if (editingTransaction) {
        await financeService.updateTransaction(
          houseId,
          editingTransaction.transactionId,
          currentUserId,
          {
            amount,
            description,
            splitWith: finalSplit,
            splitAmounts,
          }
        );
      } else {
        await financeService.addTransaction(
          houseId,
          currentUserId,
          amount,
          description,
          finalSplit,
          splitAmounts
        );
      }
      impactMedium();
      setModalVisible(false);
    } catch (err: any) {
      notifyError();
      handleError(
        err,
        editingTransaction
          ? 'Unable to update transaction. Please try again.'
          : 'Unable to add transaction. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSplitAmountChange = (memberId: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setCustomSplits((current) => ({
      ...current,
      [memberId]: cleaned,
    }));
  };

  const handleConfirmTransaction = async (transaction: TransactionData) => {
    if (!houseId || !currentUserId) return;
    try {
      await financeService.confirmTransaction(
        houseId,
        transaction.transactionId,
        currentUserId
      );
      notifySuccess();
    } catch (err: any) {
      notifyError();
      handleError(err, 'Unable to confirm transaction.');
    }
  };

  const handleDeleteTransaction = (transaction: TransactionData) => {
    if (!houseId || !currentUserId) return;
    Alert.alert(
      'Delete transaction',
      `Delete "${transaction.description}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            notifyWarning();
            try {
              await financeService.deleteTransaction(
                houseId,
                transaction.transactionId,
                currentUserId
              );
            } catch (err: any) {
              notifyError();
              handleError(err, 'Unable to delete transaction.');
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
      const [updatedTransactions, updatedDebts, updatedSettlements] =
        await Promise.all([
        financeService.getHouseTransactions(houseId),
        financeService.calculateDebts(houseId),
        financeService.getHouseSettlements(houseId),
      ]);
      setTransactions(updatedTransactions);
      setDebts(updatedDebts);
      setSettlements(updatedSettlements);
    } catch (err: any) {
      handleError(err, 'Unable to refresh finance data.');
    } finally {
      setRefreshing(false);
    }
  }, [houseId, handleError]);

  const isTransactionConfirmed = useCallback((transaction: TransactionData) => {
    const totalParticipants = transaction.splitWith?.length ?? 0;
    const confirmedCount = transaction.confirmedBy?.length ?? 0;
    return totalParticipants > 0 && confirmedCount >= totalParticipants;
  }, []);

  const { activeTransactions, paidTransactions } = useMemo(() => {
    const active: TransactionData[] = [];
    const paid: TransactionData[] = [];
    transactions.forEach((transaction) => {
      const status = getTransactionPaymentStatus(transaction);
      if (status.isPaid) {
        paid.push(transaction);
      } else {
        active.push(transaction);
      }
    });
    return { activeTransactions: active, paidTransactions: paid };
  }, [transactions, getTransactionPaymentStatus]);

  const sortedSettlements = useMemo(() => {
    return [...settlements].sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime;
    });
  }, [settlements]);

  useEffect(() => {
    if (!focusTransactionId || !transactions.length) {
      return;
    }

    const exists = transactions.some(
      (transaction) => transaction.transactionId === focusTransactionId
    );

    if (exists) {
      setHighlightTransactionId(focusTransactionId);
      const timeout = setTimeout(() => setHighlightTransactionId(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [focusTransactionId, transactions]);

  const getDebtStatus = useCallback(
    (debt: SimplifiedDebt) => {
      const relatedTransactions = transactions.filter(
        (transaction) =>
          transaction.payerId === debt.to &&
          (transaction.splitWith || []).includes(debt.from)
      );

      if (!relatedTransactions.length) {
        return {
          label: 'Net balance',
          backgroundColor: colors.accentSoft,
          color: colors.accent,
        };
      }

      let totalDue = 0;
      let totalPaid = 0;

      relatedTransactions.forEach((transaction) => {
        const splitValues = computeSplitValues(transaction);
        const share = splitValues[debt.from] ?? 0;
        if (share <= 0) return;
        totalDue += share;
        const paid =
          debt.from === transaction.payerId
            ? share
            : Number(transaction.paidBy?.[debt.from]) || 0;
        totalPaid += Math.min(share, paid);
      });

      const roundedDue = roundCurrency(totalDue);
      const roundedPaid = roundCurrency(totalPaid);

      if (roundedDue <= 0) {
        return {
          label: 'Net balance',
          backgroundColor: colors.accentSoft,
          color: colors.accent,
        };
      }

      if (roundedPaid >= roundedDue - 0.01) {
        return {
          label: 'Paid',
          backgroundColor: colors.successSoft,
          color: colors.success,
        };
      }

      const remaining = roundCurrency(Math.max(0, roundedDue - roundedPaid));
      return {
        label: `Awaiting ${formatCurrency(remaining)}`,
        backgroundColor: colors.warningSoft,
        color: colors.warning,
      };
    },
    [transactions, computeSplitValues, formatCurrency, colors]
  );

  const openDebtDetail = () => {
    setDebtDetailVisible(true);
  };

  const closeDebtDetail = () => {
    setDebtDetailVisible(false);
  };

  const openTransactionDetail = (transaction: TransactionData) => {
    setSelectedTransaction(transaction);
    setTransactionDetailVisible(true);
  };

  const closeTransactionDetail = () => {
    setTransactionDetailVisible(false);
    setSelectedTransaction(null);
  };

  const netBalances = useMemo(() => {
    const map = new Map<string, number>();
    const applyDelta = (userId: string, delta: number) => {
      map.set(userId, roundCurrency((map.get(userId) ?? 0) + delta));
    };

    activeTransactions.forEach((transaction) => {
      const splitValues = computeSplitValues(transaction);
      const participants = Array.from(
        new Set([...(transaction.splitWith || []), transaction.payerId])
      );
      const amount = Number(transaction.amount) || 0;

      participants.forEach((memberId) => {
        const share = splitValues[memberId] ?? 0;
        if (memberId === transaction.payerId) {
          applyDelta(memberId, amount - share);
        } else {
          applyDelta(memberId, -share);
        }
      });
    });

    settlements.forEach((settlement) => {
      applyDelta(settlement.from, settlement.amount);
      applyDelta(settlement.to, -settlement.amount);
    });

    const allIds = new Set<string>([
      ...members.map((member) => member.userId),
      ...map.keys(),
    ]);

    return Array.from(allIds)
      .map((userId) => {
        const amount = map.get(userId) ?? 0;
        return {
          userId,
          name: getMemberName(userId),
          fullName: getMemberFullName(userId),
          amount,
          photoUrl: memberPhotoMap.get(userId) ?? null,
          fallbackColor: getFallbackColor(userId),
        };
      })
      .filter((item) => Math.abs(item.amount) > 0.009)
      .sort((a, b) => b.amount - a.amount);
  }, [
    activeTransactions,
    settlements,
    members,
    computeSplitValues,
    getMemberName,
    getMemberFullName,
    memberPhotoMap,
  ]);

  const openContestModal = (transaction: TransactionData) => {
    setContestingTransaction(transaction);
    setContestReason(CONTEST_REASONS[0]);
    setContestNote('');
    setContestVisible(true);
  };

  const closeContestModal = () => {
    if (submitting) return;
    setContestVisible(false);
    setContestingTransaction(null);
  };

  const handleContestSubmit = async () => {
    if (!houseId || !currentUserId || !contestingTransaction) {
      return;
    }
    try {
      setSubmitting(true);
      await financeService.contestTransaction(
        houseId,
        contestingTransaction.transactionId,
        currentUserId,
        contestReason,
        contestNote
      );
      notifySuccess();
      setContestVisible(false);
      setContestingTransaction(null);
    } catch (err: any) {
      notifyError();
      handleError(err, 'Unable to contest this transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewContest = (transaction: TransactionData, memberId: string) => {
    const note = transaction.contestNotes?.[memberId];
    if (!note) {
      Alert.alert('Contest', 'No contest details were provided.');
      return;
    }
    const memberName = getMemberName(memberId);
    Alert.alert(
      'Contest details',
      `${memberName} flagged this bill.\n\nReason: ${note.reason}${
        note.note ? `\nNotes: ${note.note}` : ''
      }`
    );
  };

  const handleSettleDebt = async (debt: SimplifiedDebt) => {
    if (!houseId || !currentUserId) return;
    if (currentUserId !== debt.from) {
      Alert.alert('Finance', 'Only the person who owes can mark this as paid.');
      return;
    }

    Alert.alert(
      'Settle up',
      `Mark ${formatCurrency(debt.amount)} as paid to ${getMemberName(
        debt.to,
        debt.toName
      )}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          style: 'default',
          onPress: async () => {
            try {
              await financeService.addSettlement(
                houseId,
                debt.from,
                debt.to,
                debt.amount,
                currentUserId
              );
              notifySuccess();
              loadDebts();
            } catch (err: any) {
              notifyError();
              handleError(err, 'Unable to mark this debt as paid.');
            }
          },
        },
      ]
    );
  };

  const renderDebtSummary = () => {
    if (!isInHouse) return null;

    if (debtsLoading && !debts.length) {
      return (
        <RNView style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Debt Summary</Text>
          <ActivityIndicator color={colors.accent} />
        </RNView>
      );
    }

    if (!debts.length) {
      return (
        <RNView style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Debt Summary</Text>
          <Text style={styles.emptyStateSubtitle}>All settled. No debts to show.</Text>
        </RNView>
      );
    }

    const netTotals = debts.reduce(
      (acc, debt) => {
        if (debt.from === currentUserId) acc.owes += debt.amount;
        if (debt.to === currentUserId) acc.owed += debt.amount;
        return acc;
      },
      { owes: 0, owed: 0 }
    );
    const netAmount = netTotals.owed - netTotals.owes;
    const netLabel = netAmount >= 0 ? "You're owed" : 'You owe';
    const netColor = netAmount >= 0 ? colors.success : colors.danger;

    return (
      <RNView style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Debt Summary</Text>
        <Pressable style={styles.debtSummaryCard} onPress={openDebtDetail}>
          <Text style={styles.debtSummaryLabel}>{netLabel}</Text>
          <Text style={[styles.debtSummaryAmount, { color: netColor }]}>
            {formatCurrency(Math.abs(netAmount))}
          </Text>
          <Text style={styles.debtSummaryHint}>
            Unpaid transactions only. Tap a row for details.
          </Text>
          <RNView style={styles.debtSummaryMetaRow}>
            <RNView style={styles.debtSummaryChip}>
              <Text style={styles.debtSummaryChipLabel}>You owe</Text>
              <Text style={styles.debtSummaryChipValue}>
                {formatCurrency(netTotals.owes)}
              </Text>
            </RNView>
            <RNView style={[styles.debtSummaryChip, { marginRight: 0 }]}>
              <Text style={styles.debtSummaryChipLabel}>You're owed</Text>
              <Text style={styles.debtSummaryChipValue}>
                {formatCurrency(netTotals.owed)}
              </Text>
            </RNView>
          </RNView>
        </Pressable>

        <RNView style={styles.debtList}>
          {debts.map((debt) => {
            const isCurrentUserDebtor = debt.from === currentUserId;
            const isCurrentUserCreditor = debt.to === currentUserId;
            const counterpartId = isCurrentUserDebtor ? debt.to : debt.from;
            const counterpartName = isCurrentUserDebtor
              ? getMemberName(debt.to, debt.toName)
              : getMemberName(debt.from, debt.fromName);
            const label = isCurrentUserDebtor
              ? 'You owe'
              : isCurrentUserCreditor
              ? 'Owes you'
              : `${getMemberName(debt.from, debt.fromName)} owes ${getMemberName(
                  debt.to,
                  debt.toName
                )}`;
            const amountColor = isCurrentUserDebtor
              ? colors.danger
              : isCurrentUserCreditor
              ? colors.success
              : colors.accent;
            const canSettle = currentUserId === debt.from;
            const canNudge = currentUserId === debt.to;
            const photoUrl = memberPhotoMap.get(counterpartId) ?? null;
            const fallbackColor = getFallbackColor(counterpartId);
            return (
              <Pressable
                key={`${debt.from}-${debt.to}`}
                style={styles.debtListRow}
                onPress={openDebtDetail}
              >
                <RNView style={styles.debtListLeft}>
                  <Pressable onPress={() => openProfileOverview(counterpartId)}>
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        style={styles.debtListAvatar}
                        contentFit="cover"
                        cachePolicy="disk"
                        transition={150}
                      />
                    ) : (
                      <RNView
                        style={[
                          styles.debtListAvatar,
                          { backgroundColor: fallbackColor },
                        ]}
                      >
                        <Text style={styles.debtListAvatarText}>
                          {getInitial(counterpartName)}
                        </Text>
                      </RNView>
                    )}
                  </Pressable>
                  <RNView>
                    <Text style={styles.debtListName}>{counterpartName}</Text>
                    <Text style={styles.debtListLabel}>{label}</Text>
                  </RNView>
                </RNView>
                <RNView style={styles.debtListRight}>
                  <Text style={[styles.debtListAmount, { color: amountColor }]}>
                    {formatCurrency(debt.amount)}
                  </Text>
                  {canSettle && (
                    <TouchableOpacity
                      style={styles.debtListSettleButton}
                      onPress={() => handleSettleDebt(debt)}
                    >
                      <Text style={styles.debtListSettleText}>Settle up</Text>
                    </TouchableOpacity>
                  )}
                  {canNudge && (
                    <TouchableOpacity
                      style={styles.debtListNudgeButton}
                      onPress={() => handleSendDebtNudge(debt)}
                    >
                      <Text style={styles.debtListNudgeText}>Nudge</Text>
                    </TouchableOpacity>
                  )}
                </RNView>
              </Pressable>
            );
          })}
        </RNView>
      </RNView>
    );
  };

  const handleSendDebtNudge = async (debt: SimplifiedDebt) => {
    if (!houseId || !currentUserId) return;
    try {
      impactLight();
      const debtorName = getMemberName(debt.from, debt.fromName);
      await notificationService.sendAlfredNudge(houseId, currentUserId, 'NUDGE', {
        subject: `Settle up ${formatCurrency(debt.amount)} with ${debtorName}`,
        debtFrom: debt.from,
        debtTo: debt.to,
        amount: debt.amount,
      });
      Alert.alert('Alfred', 'Nudge sent.');
    } catch (error: any) {
      notifyError();
      Alert.alert('Finance', error?.message || 'Unable to send nudge.');
    }
  };

  const renderDebtDetailModal = () => {
    return (
      <Modal
        visible={debtDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDebtDetail}
      >
        <RNView style={styles.modalBackdrop}>
          <RNView style={styles.debtDetailContent}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>House breakdown</Text>
              <Pressable onPress={closeDebtDetail}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </RNView>
            <Text style={styles.debtDetailSubtitle}>
              We total everyone’s unpaid balances, then simplify the payments.
            </Text>

            <Text style={styles.debtDetailSectionTitle}>Net balances</Text>
            <ScrollView contentContainerStyle={styles.debtDetailList}>
              {netBalances.length === 0 ? (
                <Text style={styles.emptyStateSubtitle}>
                  No outstanding balances right now.
                </Text>
              ) : (
                netBalances.map((member) => {
                  const amountColor =
                    member.amount >= 0 ? styles.balancePositive : styles.balanceNegative;
                  return (
                    <RNView key={member.userId} style={styles.debtOverviewRow}>
                      <Pressable
                        style={styles.debtDetailAvatar}
                        onPress={() => openProfileOverview(member.userId)}
                      >
                        {member.photoUrl ? (
                          <Image
                            source={{ uri: member.photoUrl }}
                            style={styles.debtDetailAvatarImage}
                            contentFit="cover"
                            cachePolicy="disk"
                            transition={150}
                          />
                        ) : (
                          <RNView
                            style={[
                              styles.debtDetailAvatarImage,
                              { backgroundColor: member.fallbackColor },
                            ]}
                          >
                            <Text style={styles.debtDetailAvatarText}>
                              {getInitial(member.name)}
                            </Text>
                          </RNView>
                        )}
                      </Pressable>
                      <RNView style={styles.debtOverviewMeta}>
                        <Text style={styles.debtDetailSplitName}>{member.name}</Text>
                        <Text style={styles.debtDetailMeta}>
                          {member.amount >= 0 ? 'Is owed' : 'Owes'}
                        </Text>
                      </RNView>
                      <Text style={[styles.debtOverviewAmount, amountColor]}>
                        {formatSignedCurrency(member.amount)}
                      </Text>
                    </RNView>
                  );
                })
              )}
            </ScrollView>

            <Text style={styles.debtDetailSectionTitle}>Simplified payments</Text>
            <RNView style={styles.debtDetailList}>
              {debts.length === 0 ? (
                <Text style={styles.emptyStateSubtitle}>All settled.</Text>
              ) : (
                debts.map((debt) => (
                  <RNView key={`${debt.from}-${debt.to}`} style={styles.debtOverviewRow}>
                    <Text style={styles.debtDetailSplitName}>
                      {getMemberName(debt.from, debt.fromName)} owes{' '}
                      {getMemberName(debt.to, debt.toName)}
                    </Text>
                    <Text style={[styles.debtOverviewAmount, styles.balanceNegative]}>
                      {formatCurrency(debt.amount)}
                    </Text>
                  </RNView>
                ))
              )}
            </RNView>
          </RNView>
        </RNView>
      </Modal>
    );
  };

  const renderTransactionCard = ({ item }: { item: TransactionData }) => {
    const payerName = getMemberName(item.payerId, item.payerName);
    const splitMembers = item.splitWith || [];
    const owingMembers = splitMembers.filter((memberId) => memberId !== item.payerId);
    const avatarsToShow = owingMembers.slice(0, 4);
    const extraCount = Math.max(0, owingMembers.length - avatarsToShow.length);
    const paymentStatus = getTransactionPaymentStatus(item);
    const splitValues = paymentStatus.splitValues;
    const isPaid = paymentStatus.isPaid;
    const totalParticipants = paymentStatus.totalParticipants;
    const totalDue = paymentStatus.totalDue;
    const totalPaid = paymentStatus.totalPaid;
    const contestedCount = item.contestedBy?.length ?? 0;
    const isContested = contestedCount > 0;
    const isConfirmed = isTransactionConfirmed(item);
    const isUserInSplit =
      !!currentUserId && (item.splitWith || []).includes(currentUserId);
    const hasUserConfirmed =
      !!currentUserId && (item.confirmedBy || []).includes(currentUserId);
    const needsUserConfirmation = isUserInSplit && !hasUserConfirmed;
    const isPayer = item.payerId === currentUserId;
    const ageDays = getAgeInDays(item.createdAt);
    const urgencyTone = getUrgencyTone(ageDays);
    const urgencyDisplay = isContested
      ? { ...urgencyTone, color: colors.danger, background: colors.dangerSoft }
      : urgencyTone;
    const isRecent = ageDays < 1 && !isPaid;
    const showUrgency = !isPaid && ageDays >= 3;
    const stampLabel = isRecent ? 'New' : showUrgency ? `${ageDays}d` : null;
    const ringColor = isContested
      ? colors.warning
      : isPaid
      ? colors.success
      : ageDays >= 7
      ? colors.danger
      : ageDays >= 3
      ? colors.warning
      : colors.accentMuted;
    const hasUserContested =
      !!currentUserId && (item.contestedBy || []).includes(currentUserId);
    const isHighlighted = highlightTransactionId === item.transactionId;

    let badgeLabel = 'Unpaid';
    let badgeBackground = colors.dangerSoft;
    let badgeColor = colors.danger;

    if (isPaid) {
      badgeLabel = 'Paid';
      badgeBackground = colors.successSoft;
      badgeColor = colors.success;
    } else if (totalDue > 0 && totalPaid > 0) {
      badgeLabel = `Paid ${formatCurrency(totalPaid)} / ${formatCurrency(totalDue)}`;
      badgeBackground = colors.warningSoft;
      badgeColor = colors.warning;
    } else if (totalDue > 0 && totalParticipants > 0) {
      badgeLabel = `Unpaid ${formatCurrency(totalDue)}`;
      badgeBackground = colors.dangerSoft;
      badgeColor = colors.danger;
    }

    return (
        <Pressable
        style={[
          styles.transactionCard,
          isContested && styles.transactionCardContested,
          isHighlighted && styles.transactionCardHighlighted,
          {
            borderColor: ringColor,
            borderWidth: 2,
          },
        ]}
        onPress={() => openTransactionDetail(item)}
      >
          {!isContested && <RNView style={styles.receiptNotchLeft} />}
          {!isContested && <RNView style={styles.receiptNotchRight} />}
        <RNView style={styles.transactionHeader}>
          <RNView style={styles.transactionHeaderLeft}>
            {memberPhotoMap.get(item.payerId) ? (
              <Pressable onPress={() => openProfileOverview(item.payerId)}>
                <Image
                  source={{ uri: memberPhotoMap.get(item.payerId) as string }}
                  style={styles.payerAvatarLarge}
                  contentFit="cover"
                  cachePolicy="disk"
                  transition={150}
                />
              </Pressable>
            ) : (
              <Pressable onPress={() => openProfileOverview(item.payerId)}>
                <RNView
                  style={[
                    styles.payerAvatarLarge,
                    styles.payerAvatarFallback,
                    { backgroundColor: getFallbackColor(item.payerId) },
                  ]}
                >
                  <Text style={styles.payerAvatarText}>{getInitial(payerName)}</Text>
                </RNView>
              </Pressable>
            )}
            <RNView style={styles.transactionMetaBlock}>
              <RNView style={styles.transactionTitleRow}>
                <ExpandableTitle
                  text={item.description || 'Shared expense'}
                  style={styles.transactionReceiptTitle}
                />
              </RNView>
              <Text style={styles.transactionPayerLine}>{payerName} paid for</Text>
            </RNView>
          </RNView>
          <Text
            style={[
              styles.transactionAmount,
              isPaid && styles.transactionAmountSettled,
            ]}
          >
            {formatCurrency(item.amount)}
          </Text>
        </RNView>

        <RNView style={styles.owingRow}>
          <RNView style={styles.avatarStack}>
            {avatarsToShow.map((memberId, index) => {
              const name = getMemberName(memberId);
              const photoUrl = memberPhotoMap.get(memberId) ?? null;
              const fallbackColor = getFallbackColor(memberId);
              const memberShare = splitValues[memberId] ?? 0;
              const memberPaid = Number(item.paidBy?.[memberId]) || 0;
              const memberPaidUp = memberShare > 0 && memberPaid >= memberShare - 0.01;
              const memberContested = (item.contestedBy || []).includes(memberId);
              const showSettledTick = memberPaidUp;
              return (
                <Pressable
                  key={`${item.transactionId}-${memberId}`}
                  style={[
                    styles.avatarChip,
                    memberPaidUp && styles.avatarConfirmed,
                    memberContested && styles.avatarContested,
                    { marginLeft: index === 0 ? 0 : -8 },
                  ]}
                  onPress={() => openProfileOverview(memberId)}
                >
                  <RNView
                    style={[
                      styles.avatarInner,
                      !photoUrl && { backgroundColor: fallbackColor },
                    ]}
                  >
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        style={styles.avatarImage}
                        contentFit="cover"
                        cachePolicy="disk"
                        transition={150}
                      />
                    ) : (
                      <Text style={styles.avatarText}>{getInitial(name)}</Text>
                    )}
                  </RNView>
                  {showSettledTick && (
                    <RNView style={styles.avatarTick}>
                      <FontAwesome name="check" size={8} color={colors.onAccent} />
                    </RNView>
                  )}
                  {memberContested && (
                    <Pressable
                      style={styles.avatarAlert}
                      onPress={() => handleViewContest(item, memberId)}
                      hitSlop={6}
                    >
                      <FontAwesome name="exclamation" size={9} color={colors.onAccent} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            {extraCount > 0 && (
              <RNView style={[styles.avatarChip, styles.avatarOverflow]}>
                <Text style={styles.avatarOverflowText}>+{extraCount}</Text>
              </RNView>
            )}
            {owingMembers.length === 0 && (
              <RNView style={styles.owingEmpty}>
                <Text style={styles.owingEmptyText}>Only you</Text>
              </RNView>
            )}
          </RNView>
        </RNView>

        <RNView style={styles.transactionMetaRow}>
          <Text style={styles.transactionMeta}>{formatDateTime(item.createdAt)}</Text>
          {!!stampLabel && (
            <RNView
              style={[
                styles.transactionMetaStamp,
                { backgroundColor: urgencyDisplay.background },
              ]}
            >
              <Text
                style={[
                  styles.transactionMetaStampText,
                  { color: urgencyDisplay.color },
                ]}
              >
                {stampLabel}
              </Text>
            </RNView>
          )}
        </RNView>

        <RNView style={styles.receiptDivider} />

        <RNView style={styles.transactionFooter}>
          <RNView style={styles.footerBadges}>
            <RNView style={[styles.statusBadge, { backgroundColor: badgeBackground }]}>
              <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                {badgeLabel}
              </Text>
              {isContested && (
                <RNView style={styles.statusBadgeAlert}>
                  <FontAwesome name="exclamation" size={11} color={colors.onAccent} />
                </RNView>
              )}
            </RNView>
          </RNView>
          <RNView style={styles.transactionActions}>
            {needsUserConfirmation && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => handleConfirmTransaction(item)}
                accessibilityLabel="Confirm payment"
              >
                <FontAwesome name="check" size={14} color={colors.onAccent} />
              </TouchableOpacity>
            )}
            {isPayer && !isConfirmed && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => openEditModal(item)}
                accessibilityLabel="Edit expense"
              >
                <FontAwesome name="pencil" size={13} color={colors.accent} />
              </TouchableOpacity>
            )}
            {isPayer && !isConfirmed ? (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteTransaction(item)}
                accessibilityLabel="Delete expense"
              >
                <FontAwesome name="trash" size={13} color={colors.danger} />
              </TouchableOpacity>
            ) : !isConfirmed && !hasUserConfirmed ? (
              <TouchableOpacity
                style={[
                  styles.contestButton,
                  hasUserContested && styles.contestButtonDisabled,
                ]}
                onPress={() => openContestModal(item)}
                disabled={hasUserContested}
                accessibilityLabel={hasUserContested ? 'Contested' : 'Contest expense'}
              >
                <FontAwesome
                  name={hasUserContested ? 'exclamation-circle' : 'flag'}
                  size={13}
                  color={hasUserContested ? colors.muted : colors.warning}
                />
              </TouchableOpacity>
            ) : null}
          </RNView>
        </RNView>
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    if (loading) {
      return null;
    }

    if (transactions.length > 0) {
      return (
        <RNView style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateTitle}>All paid up</Text>
          <Text style={styles.emptyStateSubtitle}>
            Everything has been settled. Paid bills appear below.
          </Text>
        </RNView>
      );
    }

    return (
      <RNView style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateTitle}>No expenses yet</Text>
        <Text style={styles.emptyStateSubtitle}>
          No expenses yet. Tap + to add your first bill.
        </Text>
      </RNView>
    );
  };

  const renderTransactionDetailModal = () => {
    if (!selectedTransaction) return null;
    const { title, details } = splitDescription(selectedTransaction.description);
    const payerName = getMemberName(
      selectedTransaction.payerId,
      selectedTransaction.payerName
    );
    const splitValues = computeSplitValues(selectedTransaction);
    const participants = Array.from(
      new Set([...(selectedTransaction.splitWith || []), selectedTransaction.payerId])
    )
      .map((userId) => ({
        userId,
        name: getMemberName(userId),
        share: splitValues[userId] ?? 0,
      }))
      .filter((item) => item.share > 0.009);

    return (
      <Modal
        visible={transactionDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={closeTransactionDetail}
      >
        <RNView style={styles.modalBackdrop}>
          <RNView style={styles.debtDetailContent}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Expense details</Text>
              <Pressable onPress={closeTransactionDetail}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </RNView>
            <ExpandableTitle text={title} style={styles.debtDetailTitle} />
            {!!details && <Text style={styles.debtDetailMeta}>{details}</Text>}
            <RNView style={styles.transactionDetailAmountRow}>
              <Text style={styles.transactionDetailLabel}>Amount</Text>
              <Text style={styles.transactionDetailAmount}>
                {formatCurrency(Number(selectedTransaction.amount) || 0)}
              </Text>
            </RNView>
            <Text style={styles.transactionDetailMeta}>
              {formatDateTime(selectedTransaction.createdAt)}
            </Text>

            <RNView style={styles.debtDetailSplitRow}>
              <RNView style={styles.debtDetailSplitLeft}>
                <Text style={styles.debtDetailSplitLabel}>Paid by</Text>
                <Text style={styles.debtDetailSplitName}>{payerName}</Text>
              </RNView>
              <RNView style={styles.debtDetailSplitRight}>
                <Text style={styles.debtDetailSplitLabel}>Split</Text>
                <RNView style={styles.debtDetailSplitList}>
                  {participants.map((item) => (
                    <RNView key={item.userId} style={styles.debtDetailSplitItem}>
                      <Text style={styles.debtDetailSplitName}>{item.name}</Text>
                      <Text style={styles.debtDetailSplitValue}>
                        {formatCurrency(item.share)}
                      </Text>
                    </RNView>
                  ))}
                </RNView>
              </RNView>
            </RNView>
          </RNView>
        </RNView>
      </Modal>
    );
  };

  const renderModal = () => {
    const canProceed = Number.isFinite(totalAmount) && totalAmount >= 0;
    const selectedCount = selectedSplitIds.length;
    const perPerson = selectedCount ? totalAmount / selectedCount : 0;
    const splitSummary =
      splitMode === 'equal'
        ? `${formatCurrency(perPerson)} / person`
        : `${formatCurrency(totalSplitAmount)} of ${formatCurrency(totalAmount)}`;
    const splitSubText =
      splitMode === 'equal'
        ? `(${selectedCount} people)`
        : `${selectedCount} people`;

    const setCustomToEqual = () => {
      const equal = buildEqualSplit(totalAmount, selectedSplitIds);
      const next: Record<string, string> = {};
      selectedSplitIds.forEach((id) => {
        next[id] = (equal[id] ?? 0).toFixed(2);
      });
      setCustomSplits(next);
    };

    return (
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
            <RNView style={styles.modalContent}>
              <RNView style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingTransaction ? 'Edit expense' : 'Add new expense'}
                </Text>
                <TouchableOpacity onPress={closeModal}>
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </RNView>
              <Text style={styles.stepLabel}>Step {modalStep} of 2</Text>

              {modalStep === 1 ? (
                <>
                  <Text style={styles.amountLabel}>Amount</Text>
                  <RNView style={styles.amountInputRow}>
                    <Text style={styles.amountCurrency}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      value={amountInput}
                      onChangeText={setAmountInput}
                    />
                  </RNView>

                  <Text style={styles.modalLabel}>Title</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Electricity bill"
                    placeholderTextColor={colors.muted}
                    value={descriptionInput}
                    onChangeText={setDescriptionInput}
                  />

                  <Text style={styles.modalLabel}>Details (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Add any extra notes"
                    placeholderTextColor={colors.muted}
                    value={detailsInput}
                    onChangeText={setDetailsInput}
                  />

                  {/* TODO: Premium users get Receipt OCR here */}

                  <Text style={styles.modalLabel}>I paid for</Text>
                  <RNView style={styles.dropdownContainer}>
                    <RNView style={[styles.dropdownChip, styles.dropdownChipActive]}>
                      <Text style={styles.dropdownChipTextActive}>
                        {currentUserId
                          ? `${getMemberName(currentUserId, userProfile?.name)} (You)`
                          : 'You'}
                      </Text>
                    </RNView>
                  </RNView>

                  <RNView style={styles.modalActionsRow}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={closeModal}
                      disabled={submitting}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        styles.modalPrimaryButton,
                        !canProceed && styles.buttonDisabled,
                      ]}
                      onPress={() => setModalStep(2)}
                      disabled={!canProceed}
                    >
                      <Text style={styles.modalPrimaryText}>Next</Text>
                    </TouchableOpacity>
                  </RNView>
                </>
              ) : (
                <>
                  <RNView style={styles.splitModeRow}>
                    <Text style={styles.modalLabel}>Split by</Text>
                    <RNView style={styles.splitModeChips}>
                      <Pressable
                        style={[
                          styles.splitModeChip,
                          splitMode === 'equal' && styles.splitModeChipActive,
                        ]}
                        onPress={() => setSplitMode('equal')}
                      >
                        <Text
                          style={[
                            styles.splitModeText,
                            splitMode === 'equal' && styles.splitModeTextActive,
                          ]}
                        >
                          Equally
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.splitModeChip,
                          splitMode === 'custom' && styles.splitModeChipActive,
                        ]}
                        onPress={() => {
                          setSplitMode('custom');
                          setCustomToEqual();
                        }}
                      >
                        <Text
                          style={[
                            styles.splitModeText,
                            splitMode === 'custom' && styles.splitModeTextActive,
                          ]}
                        >
                          Custom
                        </Text>
                      </Pressable>
                    </RNView>
                  </RNView>

                  <ScrollView style={styles.splitList} contentContainerStyle={styles.splitListContent}>
                    {members.map((member) => {
                      const isSelected = splitWithInput.includes(member.userId);
                      const amountValue = resolvedSplitAmounts[member.userId] ?? 0;
                      const percent = totalAmount > 0 ? (amountValue / totalAmount) * 100 : 0;
                      const name = getMemberName(member.userId, member.name);
                      const photoUrl = memberPhotoMap.get(member.userId) ?? null;
                      const fallbackColor = getFallbackColor(member.userId);
                      return (
                        <RNView key={member.userId} style={styles.splitRow}>
                          <Pressable
                            onPress={() => toggleSplitMember(member.userId)}
                            style={styles.splitAvatarPress}
                          >
                            {photoUrl ? (
                              <Image
                                source={{ uri: photoUrl }}
                                style={styles.splitAvatar}
                                contentFit="cover"
                                cachePolicy="disk"
                                transition={150}
                              />
                            ) : (
                              <RNView
                                style={[
                                  styles.splitAvatarFallback,
                                  { backgroundColor: fallbackColor },
                                ]}
                              >
                                <Text style={styles.splitAvatarText}>
                                  {getInitial(name)}
                                </Text>
                              </RNView>
                            )}
                          </Pressable>
                          <RNView style={styles.splitInfo}>
                            <Text style={styles.splitName}>
                              {name}
                              {member.userId === currentUserId ? ' (You)' : ''}
                            </Text>
                            {isSelected ? (
                              <RNView style={styles.splitAmountRow}>
                                {splitMode === 'custom' ? (
                                  <TextInput
                                    style={styles.splitAmountInput}
                                    keyboardType="numeric"
                                    value={customSplits[member.userId] ?? amountValue.toFixed(2)}
                                    onChangeText={(value) =>
                                      handleSplitAmountChange(member.userId, value)
                                    }
                                  />
                                ) : (
                                  <Text style={styles.splitAmountText}>
                                    {formatCurrency(amountValue)}
                                  </Text>
                                )}
                                <Text style={styles.splitPercentText}>
                                  {Math.round(percent)}%
                                </Text>
                              </RNView>
                            ) : (
                              <Text style={styles.splitHint}>Tap to include</Text>
                            )}
                          </RNView>
                          <Pressable
                            onPress={() => toggleSplitMember(member.userId)}
                            style={[
                              styles.splitCheck,
                              isSelected && styles.splitCheckActive,
                            ]}
                          >
                            {isSelected && (
                              <FontAwesome name="check" size={10} color={colors.onAccent} />
                            )}
                          </Pressable>
                        </RNView>
                      );
                    })}
                  </ScrollView>

                  <RNView style={styles.splitSummaryRow}>
                    <Text style={styles.splitSummaryText}>{splitSummary}</Text>
                    <Text
                      style={[
                        styles.splitSummaryText,
                        !isCustomSplitValid && styles.splitSummaryError,
                      ]}
                    >
                      {splitSubText}
                    </Text>
                  </RNView>
                  {!isCustomSplitValid && (
                    <Text style={styles.splitErrorText}>
                      Split amounts must match the total.
                    </Text>
                  )}

                  <RNView style={styles.modalActionsRow}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setModalStep(1)}
                      disabled={submitting}
                    >
                      <Text style={styles.modalCancelText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        styles.modalPrimaryButton,
                        (!isCustomSplitValid || submitting) && styles.buttonDisabled,
                      ]}
                      onPress={handleSubmit}
                      disabled={submitting || !isCustomSplitValid}
                    >
                      {submitting ? (
                        <ActivityIndicator color={colors.onAccent} />
                      ) : (
                        <Text style={styles.modalPrimaryText}>
                          {editingTransaction ? 'Save changes' : 'Save expense'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </RNView>
                </>
              )}
            </RNView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  if (!isInHouse) {
    return (
      <ScreenShell>
        <RNView style={styles.centeredMessage}>
          <Text style={styles.title}>Join or create a house</Text>
          <Text style={styles.description}>
            Finance lives inside a house. Once you join or create a house, you will see shared
            bills here.
          </Text>
        </RNView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={styles.container}>
      <Animated.FlatList
        data={activeTransactions}
        keyExtractor={(item) => item.transactionId}
        contentContainerStyle={styles.listContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <RNView>
            <Text style={styles.title}>Finance</Text>
            {renderDebtSummary()}
            <RNView style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            <Text style={styles.sectionSubtitle}>
              Unpaid expenses only. Confirm to acknowledge.
            </Text>
            </RNView>
          </RNView>
        }
        renderItem={renderTransactionCard}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          <RNView style={styles.settledSection}>
            <Pressable
              style={styles.settledHeader}
              onPress={() => setShowSettled((prev) => !prev)}
            >
              <Text style={styles.sectionTitle}>
                Paid bills ({paidTransactions.length})
              </Text>
              <Text style={styles.settledToggleText}>
                {showSettled ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
            {showSettled && (
              <RNView style={styles.settledList}>
                {paidTransactions.length === 0 ? (
                  <Text style={styles.emptyStateSubtitle}>No paid bills yet.</Text>
                ) : (
                  paidTransactions.map((transaction) => {
                    const { title, details } = splitDescription(transaction.description);
                    const payerName = getMemberName(
                      transaction.payerId,
                      transaction.payerName
                    );
                    const createdAt = transaction.createdAt?.toDate
                      ? transaction.createdAt.toDate().toLocaleDateString()
                      : 'Just now';
                    return (
                      <RNView key={transaction.transactionId} style={styles.settledCard}>
                        <RNView style={styles.paymentRow}>
                          <ExpandableTitle text={title} style={styles.paymentTitle} />
                          <RNView style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>Paid</Text>
                          </RNView>
                        </RNView>
                        {!!details && <Text style={styles.paymentMeta}>{details}</Text>}
                        <RNView style={styles.paymentRow}>
                          <Text style={styles.paymentMeta}>Paid by {payerName}</Text>
                          <Text style={styles.paymentAmount}>
                            {formatCurrency(transaction.amount)}
                          </Text>
                        </RNView>
                        <Text style={styles.paymentMeta}>{createdAt}</Text>
                      </RNView>
                    );
                  })
                )}

                <RNView style={styles.settledDivider} />
                <Text style={styles.settledSubheader}>Payments</Text>
                {sortedSettlements.length === 0 ? (
                  <Text style={styles.emptyStateSubtitle}>No payments recorded yet.</Text>
                ) : (
                  sortedSettlements.map((settlement) => {
                    const fromName = getMemberName(settlement.from);
                    const toName = getMemberName(settlement.to);
                    const createdAt = settlement.createdAt?.toDate
                      ? settlement.createdAt.toDate().toLocaleDateString()
                      : 'Just now';
                    return (
                      <RNView key={settlement.settlementId} style={styles.settledCard}>
                        <RNView style={styles.paymentRow}>
                          <ExpandableTitle
                            text={`${fromName} paid ${toName}`}
                            style={styles.paymentTitle}
                          />
                          <Text style={styles.paymentAmount}>
                            {formatCurrency(settlement.amount)}
                          </Text>
                        </RNView>
                        <Text style={styles.paymentMeta}>{createdAt}</Text>
                        {!!settlement.note && (
                          <Text style={styles.paymentMeta}>{settlement.note}</Text>
                        )}
                      </RNView>
                    );
                  })
                )}
              </RNView>
            )}
          </RNView>
        }
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
        <Text style={styles.stickyHeaderTitle}>Finance</Text>
      </Animated.View>

      <ProfileOverviewModal
        visible={profileVisible}
        user={selectedProfile}
        onClose={() => setProfileVisible(false)}
      />

      {renderDebtDetailModal()}
      {renderTransactionDetailModal()}
      {renderModal()}
      {contestVisible && (
        <Modal
          visible={contestVisible}
          transparent
          animationType="slide"
          onRequestClose={closeContestModal}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              style={styles.modalBackdrop}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <RNView style={styles.modalContent}>
                <ScrollView contentContainerStyle={styles.modalScrollContent}>
                  <Text style={styles.modalTitle}>Contest charge</Text>
                  <Text style={styles.modalHelperText}>
                    Tell the payer what needs fixing. This does not delete the bill.
                  </Text>

                  <Text style={styles.modalLabel}>Reason</Text>
                  <RNView style={styles.dropdownContainer}>
                    {CONTEST_REASONS.map((reason) => (
                      <Pressable
                        key={reason}
                        style={[
                          styles.dropdownChip,
                          contestReason === reason && styles.dropdownChipActive,
                        ]}
                        onPress={() => setContestReason(reason)}
                      >
                        <Text
                          style={[
                            styles.dropdownChipText,
                            contestReason === reason &&
                              styles.dropdownChipTextActive,
                          ]}
                        >
                          {reason}
                        </Text>
                      </Pressable>
                    ))}
                  </RNView>

                  <Text style={styles.modalLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    placeholder="Add a short note for the payer"
                    placeholderTextColor={colors.muted}
                    value={contestNote}
                    onChangeText={setContestNote}
                    multiline
                  />

                  <RNView style={styles.modalActionsRow}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={closeContestModal}
                      disabled={submitting}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalPrimaryButton]}
                      onPress={handleContestSubmit}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color={colors.onAccent} />
                      ) : (
                        <Text style={styles.modalPrimaryText}>Send</Text>
                      )}
                    </TouchableOpacity>
                  </RNView>
                </ScrollView>
              </RNView>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>
      )}

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
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 12,
  },
  debtSummaryHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
  },
  debtSummaryCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  debtSummaryLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  debtSummaryAmount: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  debtSummaryMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  debtSummaryChip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  debtSummaryChipLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  debtSummaryChipValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    marginTop: 2,
  },
  debtList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  debtListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  debtListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debtListRight: {
    alignItems: 'flex-end',
  },
  debtListAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  debtListAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onAccent,
  },
  debtListName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  debtListLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  debtListAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  debtListSettleButton: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  debtListSettleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onAccent,
  },
  debtListNudgeButton: {
    marginTop: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  debtListNudgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  sectionHeaderRow: {
    marginBottom: 8,
  },
  debtCard: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 10,
  },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtLabel: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  debtAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  debtMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  debtMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debtBreakdownText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 8,
  },
  settleButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 8,
  },
  settleButtonText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '600',
  },
  transactionCard: {
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  transactionCardContested: {
    borderWidth: 2,
    borderColor: colors.warning,
  },
  transactionCardHighlighted: {
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  transactionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 16,
  },
  transactionMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionMetaBlock: {
    flex: 1,
  },
  transactionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  transactionReceiptTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.2,
    flex: 1,
  },
  transactionPayerLine: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  payerAvatarLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 2,
    borderColor: colors.accentSoft,
  },
  payerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  payerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onAccent,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
    minWidth: 76,
    textAlign: 'right',
    marginTop: 2,
  },
  transactionAmountSettled: {
    color: colors.muted,
  },
  transactionMeta: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  transactionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  receiptNotchLeft: {
    position: 'absolute',
    left: -8,
    top: 56,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  receiptNotchRight: {
    position: 'absolute',
    right: -8,
    top: 56,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  receiptDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginVertical: 10,
  },
  transactionMetaStamp: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  transactionMetaStampText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  transactionFooter: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionDetailAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  transactionDetailLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  transactionDetailAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  transactionDetailMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  footerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  transactionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  owingRow: {
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  owingEmpty: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    marginLeft: 6,
  },
  owingEmptyText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  avatarChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    backgroundColor: colors.card,
  },
  avatarConfirmed: {
    borderColor: colors.success,
    borderWidth: 2,
  },
  avatarContested: {
    borderColor: colors.warning,
    borderWidth: 2,
  },
  avatarInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onAccent,
  },
  avatarOverflow: {
    backgroundColor: colors.accentSoft,
  },
  avatarOverflowText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  avatarTick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    borderWidth: 1,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  avatarAlert: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.warning,
    borderWidth: 1,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadgeAlert: {
    marginLeft: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.warning,
    borderWidth: 1,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settledSection: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: BORDER_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settledHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settledToggleText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  settledDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  settledSubheader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  settledList: {
    marginTop: 12,
  },
  settledCard: {
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  paymentMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  paidBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  confirmButton: {
    backgroundColor: colors.success,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  deleteButton: {
    backgroundColor: colors.dangerSoft,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contestButton: {
    backgroundColor: colors.warningSoft,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contestButtonDisabled: {
    opacity: 0.6,
  },
  editButton: {
    backgroundColor: colors.accentSoft,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
  },
  modalCloseText: {
    fontSize: 13,
    color: colors.muted,
  },
  debtDetailContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  debtDetailSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  balanceItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  balanceNegative: {
    color: colors.danger,
  },
  balancePositive: {
    color: colors.success,
  },
  debtDetailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  debtDetailList: {
    paddingBottom: 12,
  },
  debtDetailCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debtDetailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  debtDetailMeta: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  debtDetailImpactRow: {
    flexDirection: 'column',
    marginTop: 6,
  },
  debtDetailImpactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  debtDetailImpactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    marginRight: 12,
  },
  debtDetailImpactText: {
    fontSize: 12,
    fontWeight: '700',
  },
  debtDetailOtherText: {
    color: colors.muted,
  },
  debtDetailSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  debtDetailSplitLeft: {
    flex: 1,
    marginRight: 12,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  debtDetailSplitRight: {
    flex: 1.2,
  },
  debtDetailSplitLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  debtDetailSplitName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  debtDetailSplitAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  debtDetailSplitList: {
    marginTop: 4,
  },
  debtDetailSplitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  debtDetailAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtDetailAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtDetailAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onAccent,
  },
  debtDetailSplitMeta: {
    flex: 1,
  },
  debtDetailSplitValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  debtOverviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  debtOverviewMeta: {
    flex: 1,
    marginLeft: 8,
  },
  debtOverviewAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
  },
  amountCurrency: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.accent,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
    marginTop: 8,
  },
  modalHelperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
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
    height: 84,
    textAlignVertical: 'top',
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
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
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
  modalPrimaryButton: {
    backgroundColor: colors.accent,
  },
  modalCancelText: {
    color: colors.accent,
    fontWeight: '500',
  },
  modalPrimaryText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  splitModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  splitModeChips: {
    flexDirection: 'row',
  },
  splitModeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 8,
  },
  splitModeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  splitModeText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  splitModeTextActive: {
    color: colors.onAccent,
  },
  splitList: {
    maxHeight: 320,
  },
  splitListContent: {
    paddingBottom: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  splitAvatarPress: {
    marginRight: 12,
  },
  splitAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  splitAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitAvatarText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  splitInfo: {
    flex: 1,
  },
  splitName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  splitAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitAmountInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 2,
    minWidth: 72,
    color: colors.accent,
    fontSize: 14,
    marginRight: 8,
  },
  splitAmountText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
    marginRight: 8,
  },
  splitPercentText: {
    fontSize: 12,
    color: colors.muted,
  },
  splitHint: {
    fontSize: 12,
    color: colors.muted,
  },
  splitCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitCheckActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  splitSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  splitSummaryText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  splitSummaryError: {
    color: colors.danger,
  },
  splitErrorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
});




