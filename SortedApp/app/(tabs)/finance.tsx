import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
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

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';
const CARD_BACKGROUND = '#FFFFFF';
const MUTED_TEXT = '#6B7280';
const GREEN_ACCENT = '#16A34A';
const RED_ACCENT = '#DC2626';
const AMBER_ACCENT = '#F59E0B';
const BORDER_RADIUS = 16;

interface MemberOption {
  userId: string;
  name: string;
}

export default function FinanceScreen() {
  const { user, userProfile } = useAuth();
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
  const [splitWithInput, setSplitWithInput] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isInHouse = !!houseId;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      map.set(member.userId, member.name);
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

  const formatDate = useCallback((value: any) => {
    if (value?.toDate) {
      return value.toDate().toLocaleDateString();
    }
    return 'Just now';
  }, []);

  const getAgeInDays = useCallback((value: any) => {
    if (!value?.toDate) return 0;
    const createdAt = value.toDate();
    const diffMs = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, []);

  const getUrgencyTone = useCallback(
    (ageDays: number, confirmed: boolean) => {
      if (confirmed) {
        return { label: 'Settled', color: '#166534', background: '#DCFCE7' };
      }
      if (ageDays >= 7) {
        return { label: `Overdue ${ageDays}d`, color: '#B91C1C', background: '#FEE2E2' };
      }
      if (ageDays >= 3) {
        return { label: `Aging ${ageDays}d`, color: '#92400E', background: '#FEF3C7' };
      }
      return { label: 'Recent', color: BUTLER_BLUE, background: '#E5E7EB' };
    },
    []
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
    const defaultSplit = Array.from(
      new Set([...members.map((member) => member.userId), currentUserId])
    );
    setSplitWithInput(defaultSplit);
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
    setDescriptionInput(transaction.description);
    const defaultSplit = Array.from(
      new Set([...(transaction.splitWith || []), currentUserId])
    );
    setSplitWithInput(defaultSplit);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
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
    const description = descriptionInput.trim() || 'Shared expense';

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
          }
        );
      } else {
        await financeService.addTransaction(
          houseId,
          currentUserId,
          amount,
          description,
          finalSplit
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
          backgroundColor: '#E5E7EB',
          color: BUTLER_BLUE,
        };
      }

      const allConfirmed = relatedTransactions.every((transaction) =>
        isTransactionConfirmed(transaction)
      );

      if (allConfirmed) {
        return {
          label: 'Confirmed',
          backgroundColor: '#DCFCE7',
          color: '#166534',
        };
      }

      return {
        label: 'Pending confirmations',
        backgroundColor: '#FEF3C7',
        color: '#92400E',
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
          <ActivityIndicator color={BUTLER_BLUE} />
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
            ? RED_ACCENT
            : isCurrentUserCreditor
            ? GREEN_ACCENT
            : BUTLER_BLUE;
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
    const splitNames = (item.splitWith || [])
      .map((memberId) => getMemberName(memberId))
      .join(', ');
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
    let badgeBackground = '#E5E7EB';
    let badgeColor = BUTLER_BLUE;

    if (isConfirmed) {
      badgeLabel = 'Confirmed';
      badgeBackground = '#DCFCE7';
      badgeColor = '#166534';
    } else if (needsUserConfirmation) {
      badgeLabel = 'Needs your confirmation';
      badgeBackground = '#FEE2E2';
      badgeColor = '#B91C1C';
    } else if (isPayer) {
      badgeLabel = 'Waiting on confirmations';
      badgeBackground = '#FEF3C7';
      badgeColor = '#92400E';
    }

    return (
      <RNView style={[styles.transactionCard, { borderLeftColor: urgencyTone.color }]}>
        <RNView style={styles.transactionHeader}>
          <RNView style={{ flex: 1 }}>
            <Text style={styles.transactionTitle}>{item.description}</Text>
            <Text style={styles.transactionMeta}>
              Paid by {payerName} on {formatDate(item.createdAt)}
            </Text>
          </RNView>
          <Text style={styles.transactionAmount}>{formatCurrency(item.amount)}</Text>
        </RNView>

        <Text style={styles.transactionMeta}>Split with: {splitNames}</Text>
        <RNView style={styles.urgencyRow}>
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
          <RNView style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Transaction</Text>
            {editingTransaction && (
              <Text style={styles.modalSubtitle}>Editing resets confirmations.</Text>
            )}

            <Text style={styles.modalLabel}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={MUTED_TEXT}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={styles.input}
              placeholder="Electricity bill"
              placeholderTextColor={MUTED_TEXT}
              value={descriptionInput}
              onChangeText={setDescriptionInput}
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

            <Text style={styles.modalLabel}>Split with</Text>
            <RNView style={styles.dropdownContainer}>
              {members.map((member) => {
                const isSelected = splitWithInput.includes(member.userId);
                return (
                  <Pressable
                    key={member.userId}
                    style={[
                      styles.multiSelectChip,
                      isSelected && styles.multiSelectChipActive,
                    ]}
                    onPress={() => toggleSplitMember(member.userId)}
                  >
                    <Text
                      style={[
                        styles.dropdownChipText,
                        isSelected && styles.dropdownChipTextActive,
                      ]}
                    >
                      {member.name}
                      {member.userId === currentUserId ? ' (You)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
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
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>
                    {editingTransaction ? 'Save changes' : 'Add transaction'}
                  </Text>
                )}
              </TouchableOpacity>
            </RNView>
          </RNView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );

  if (!isInHouse) {
    return (
      <View style={styles.container} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <RNView style={styles.centeredMessage}>
          <Text style={styles.title}>Join or create a house</Text>
          <Text style={styles.description}>
            Finance lives inside a house. Once you join or create a house, you will see shared
            bills here.
          </Text>
        </RNView>
      </View>
    );
  }

  return (
    <View style={styles.container} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.transactionId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <RNView>
            <Text style={styles.title}>Finance</Text>
            <Text style={styles.description}>
              Track all house bills, split costs fairly, and keep shared expenses transparent.
            </Text>
            {renderDebtSummary()}
            <RNView style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
            </RNView>
          </RNView>
        }
        renderItem={renderTransactionCard}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BUTLER_BLUE} />
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openCreateModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {renderModal()}

      {loading && (
        <RNView style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={BUTLER_BLUE} />
        </RNView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 96,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: MUTED_TEXT,
    marginBottom: 20,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sectionCard: {
    backgroundColor: CARD_BACKGROUND,
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
    color: BUTLER_BLUE,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    marginBottom: 8,
  },
  debtCard: {
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
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
    color: BUTLER_BLUE,
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
    backgroundColor: BUTLER_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  settleButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  transactionCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 4,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: BUTLER_BLUE,
  },
  transactionMeta: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginBottom: 4,
  },
  urgencyRow: {
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
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: GREEN_ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deleteButtonText: {
    color: RED_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  editButtonText: {
    color: BUTLER_BLUE,
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
    color: BUTLER_BLUE,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: MUTED_TEXT,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: BUTLER_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CARD_BACKGROUND,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginBottom: 4,
    marginTop: 8,
  },
  modalHelperText: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BUTLER_BLUE,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 6,
  },
  dropdownChipActive: {
    backgroundColor: BUTLER_BLUE,
  },
  multiSelectChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 6,
  },
  multiSelectChipActive: {
    backgroundColor: AMBER_ACCENT,
  },
  dropdownChipText: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  dropdownChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
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
    backgroundColor: '#E5E7EB',
  },
  modalPrimaryButton: {
    backgroundColor: BUTLER_BLUE,
  },
  modalCancelText: {
    color: BUTLER_BLUE,
    fontWeight: '500',
  },
  modalPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

