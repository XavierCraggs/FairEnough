import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
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
  SimplifiedDebt,
  TransactionData,
} from '../../services/financeService';
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

const BORDER_RADIUS = 16;

interface MemberOption {
  userId: string;
  name: string;
  photoUrl?: string | null;
}

export default function FinanceScreen() {
  const { user, userProfile } = useAuth();
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0));
  const headerOpacity = scrollY.current.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 0.92],
    extrapolate: 'clamp',
  });
  const houseId = userProfile?.houseId ?? null;
  const currentUserId = user?.uid ?? null;

  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [debts, setDebts] = useState<SimplifiedDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);

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

  const isInHouse = !!houseId;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      map.set(member.userId, member.name);
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

  const getMemberName = useCallback(
    (userId: string, fallback?: string) =>
      memberNameMap.get(userId) || fallback || 'Unknown',
    [memberNameMap]
  );

  const formatCurrency = useCallback((amount: number) => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `$${safeAmount.toFixed(2)}`;
  }, []);

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

  const getAgeInDays = useCallback((value: any) => {
    if (!value?.toDate) return 0;
    const createdAt = value.toDate();
    const diffMs = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, []);

  const getUrgencyTone = useCallback(
    (ageDays: number, confirmed: boolean) => {
      if (confirmed) {
        return { label: 'Settled', color: colors.success, background: colors.successSoft };
      }
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
      return { label: 'Recent', color: colors.accent, background: colors.accentSoft };
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
            name: data.name || 'Unnamed',
            photoUrl: data.photoUrl || data.photoURL || null,
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
  }, [houseId, loadDebts, transactions]);

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

    let splitAmounts: Record<string, number> | undefined;
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
      const [updatedTransactions, updatedDebts] = await Promise.all([
        financeService.getHouseTransactions(houseId),
        financeService.calculateDebts(houseId),
      ]);
      setTransactions(updatedTransactions);
      setDebts(updatedDebts);
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

      const allConfirmed = relatedTransactions.every((transaction) =>
        isTransactionConfirmed(transaction)
      );

      if (allConfirmed) {
        return {
          label: 'Confirmed',
          backgroundColor: colors.successSoft,
          color: colors.success,
        };
      }

      return {
        label: 'Pending confirmations',
        backgroundColor: colors.warningSoft,
        color: colors.warning,
      };
    },
    [transactions, isTransactionConfirmed]
  );

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

    return (
      <RNView style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Debt Summary</Text>
        {debts.map((debt) => {
          const isCurrentUserDebtor = debt.from === currentUserId;
          const isCurrentUserCreditor = debt.to === currentUserId;
          const label = isCurrentUserDebtor
            ? `You owe ${getMemberName(debt.to, debt.toName)}`
            : isCurrentUserCreditor
            ? `${getMemberName(debt.from, debt.fromName)} owes you`
            : `${getMemberName(debt.from, debt.fromName)} owes ${getMemberName(
                debt.to,
                debt.toName
              )}`;
          const amountColor = isCurrentUserDebtor
            ? colors.danger
            : isCurrentUserCreditor
            ? colors.success
            : colors.accent;
          const status = getDebtStatus(debt);
          return (
            <RNView key={`${debt.from}-${debt.to}`} style={styles.debtCard}>
              <RNView style={styles.debtRow}>
                <Text style={styles.debtLabel}>{label}</Text>
                <Text style={[styles.debtAmount, { color: amountColor }]}>
                  {formatCurrency(debt.amount)}
                </Text>
              </RNView>
              <RNView style={styles.debtMetaRow}>
                <RNView
                  style={[
                    styles.statusBadge,
                    { backgroundColor: status.backgroundColor },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </RNView>
              </RNView>
            </RNView>
          );
        })}
      </RNView>
    );
  };

  const renderTransactionCard = ({ item }: { item: TransactionData }) => {
    const payerName = getMemberName(item.payerId, item.payerName);
    const splitMembers = item.splitWith || [];
    const avatarsToShow = splitMembers.slice(0, 4);
    const extraCount = Math.max(0, splitMembers.length - avatarsToShow.length);
    const isConfirmed = isTransactionConfirmed(item);
    const isUserInSplit =
      !!currentUserId && (item.splitWith || []).includes(currentUserId);
    const hasUserConfirmed =
      !!currentUserId && (item.confirmedBy || []).includes(currentUserId);
    const needsUserConfirmation = isUserInSplit && !hasUserConfirmed;
    const isPayer = item.payerId === currentUserId;
    const ageDays = getAgeInDays(item.createdAt);
    const urgencyTone = getUrgencyTone(ageDays, isConfirmed);

    let badgeLabel = 'Pending';
    let badgeBackground = colors.accentSoft;
    let badgeColor = colors.accent;

    if (isConfirmed) {
      badgeLabel = 'Confirmed';
      badgeBackground = colors.successSoft;
      badgeColor = colors.success;
    } else if (needsUserConfirmation) {
      badgeLabel = 'Needs your confirmation';
      badgeBackground = colors.dangerSoft;
      badgeColor = colors.danger;
    } else if (isPayer) {
      badgeLabel = 'Waiting on confirmations';
      badgeBackground = colors.warningSoft;
      badgeColor = colors.warning;
    }

    return (
      <RNView style={[styles.transactionCard, { borderLeftColor: urgencyTone.color }]}>
        <RNView style={styles.transactionHeader}>
          <Text
            style={[
              styles.transactionAmount,
              isConfirmed && styles.transactionAmountSettled,
            ]}
          >
            {formatCurrency(item.amount)}
          </Text>
        </RNView>

        <RNView style={styles.transactionMidRow}>
          <RNView style={styles.transactionMetaBlock}>
            <Text style={styles.transactionTitle}>{payerName} paid for</Text>
            <Text style={styles.transactionMeta}>
              {item.description || 'Shared expense'}
            </Text>
          </RNView>
          <RNView style={styles.avatarStack}>
            {avatarsToShow.map((memberId, index) => {
              const name = getMemberName(memberId);
              const photoUrl = memberPhotoMap.get(memberId) ?? null;
              const fallbackColor = getFallbackColor(memberId);
              return (
                <RNView
                  key={`${item.transactionId}-${memberId}`}
                  style={[
                    styles.avatarChip,
                    { marginLeft: index === 0 ? 0 : -8, backgroundColor: fallbackColor },
                  ]}
                >
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>{getInitial(name)}</Text>
                  )}
                </RNView>
              );
            })}
            {extraCount > 0 && (
              <RNView style={[styles.avatarChip, styles.avatarOverflow]}>
                <Text style={styles.avatarOverflowText}>+{extraCount}</Text>
              </RNView>
            )}
          </RNView>
        </RNView>

        <RNView style={styles.transactionMetaRow}>
          <Text style={styles.transactionMeta}>{formatDateTime(item.createdAt)}</Text>
          <RNView style={[styles.urgencyBadge, { backgroundColor: urgencyTone.background }]}>
            <Text style={[styles.urgencyBadgeText, { color: urgencyTone.color }]}>
              {urgencyTone.label}
            </Text>
          </RNView>
        </RNView>

        <RNView style={styles.transactionFooter}>
          <RNView style={[styles.statusBadge, { backgroundColor: badgeBackground }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
              {badgeLabel}
            </Text>
          </RNView>
          <RNView style={styles.transactionActions}>
            {needsUserConfirmation && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => handleConfirmTransaction(item)}
              >
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            )}
            {isPayer && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => openEditModal(item)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteTransaction(item)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </RNView>
        </RNView>
      </RNView>
    );
  };

  const renderEmptyState = () => {
    if (loading) {
      return null;
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
                              <Image source={{ uri: photoUrl }} style={styles.splitAvatar} />
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

  const activeTransactions = transactions.filter((transaction) => {
    const confirmed = isTransactionConfirmed(transaction);
    return !confirmed;
  });
  const settledTransactions = transactions.filter((transaction) =>
    isTransactionConfirmed(transaction)
  );

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
              <Text style={styles.sectionTitle}>Active Transactions</Text>
              <Text style={styles.sectionSubtitle}>
                Waiting on confirmations or payments.
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
                Settled Transactions ({settledTransactions.length})
              </Text>
              <Text style={styles.settledToggleText}>
                {showSettled ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
            {showSettled && (
              <RNView style={styles.settledList}>
                {settledTransactions.length === 0 ? (
                  <Text style={styles.emptyStateSubtitle}>No settled transactions yet.</Text>
                ) : (
                  settledTransactions.map((transaction) => (
                    <RNView key={transaction.transactionId} style={styles.settledCard}>
                      {renderTransactionCard({ item: transaction })}
                    </RNView>
                  ))
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
  settleButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  settleButtonText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '600',
  },
  transactionCard: {
    backgroundColor: colors.card,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  transactionMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionMetaBlock: {
    flex: 1,
    paddingRight: 12,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  transactionAmountSettled: {
    textDecorationLine: 'line-through',
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
  urgencyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgencyBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transactionFooter: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 28,
    height: 28,
  },
  avatarText: {
    fontSize: 11,
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
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
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
  settledList: {
    marginTop: 12,
  },
  settledCard: {
    marginBottom: 8,
  },
  confirmButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  confirmButtonText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  editButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
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



