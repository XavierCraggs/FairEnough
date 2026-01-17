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
import choreService, {
  ChoreData,
  ChoreServiceError,
} from '../../services/choreService';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';
const CARD_BACKGROUND = '#FFFFFF';
const MUTED_TEXT = '#6B7280';
const GREEN_ACCENT = '#16A34A';
const BORDER_RADIUS = 16;

type FrequencyOption = 'daily' | 'weekly' | 'one-time';
type StatusFilter = 'all' | 'pending' | 'completed';

interface MemberOption {
  userId: string;
  name: string;
}

interface FairnessMemberStat {
  userId: string;
  userName: string;
  totalPoints: number;
  deviation: number;
}

const FREQUENCY_OPTIONS: { label: string; value: FrequencyOption }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'One-time', value: 'one-time' },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
];

export default function ChoresScreen() {
  const { user, userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;

  const [chores, setChores] = useState<ChoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [fairnessLoading, setFairnessLoading] = useState(false);
  const [averagePoints, setAveragePoints] = useState<number | null>(null);
  const [memberStats, setMemberStats] = useState<FairnessMemberStat[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortByPointsDesc, setSortByPointsDesc] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChore, setEditingChore] = useState<ChoreData | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [pointsInput, setPointsInput] = useState('5');
  const [assignedToInput, setAssignedToInput] = useState<string | null>(null);
  const [frequencyInput, setFrequencyInput] = useState<FrequencyOption>('daily');
  const [submitting, setSubmitting] = useState(false);

  // Simple 3-dot menu state per chore
  const [openMenuChoreId, setOpenMenuChoreId] = useState<string | null>(null);

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
            name: data.name || 'Unnamed',
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

  const loadFairness = useCallback(async () => {
    if (!houseId) return;
    try {
      setFairnessLoading(true);
      const result = await choreService.calculateHouseFairness(houseId);
      setAveragePoints(result.averagePoints);
      setMemberStats(result.memberStats);
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
    setPointsInput('5');
    setAssignedToInput(null);
    setFrequencyInput('daily');
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (chore: ChoreData) => {
    setEditingChore(chore);
    setTitleInput(chore.title);
    setDescriptionInput(chore.description ?? '');
    setPointsInput(String(chore.points));
    setAssignedToInput(chore.assignedTo);
    setFrequencyInput(chore.frequency);
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
    if (Number.isNaN(points) || points < 0) {
      Alert.alert('Chores', 'Please enter a valid points value (0 or more).');
      return;
    }

    setSubmitting(true);

    try {
      if (editingChore) {
        await choreService.updateChore(
          houseId,
          editingChore.choreId,
          {
            title: titleInput.trim(),
            description: descriptionInput.trim(),
            points,
            frequency: frequencyInput,
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
          createdBy: user.uid,
        });
      }

      resetForm();
      setModalVisible(false);
    } catch (err: any) {
      handleError(err, 'Unable to save chore. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteChore = async (chore: ChoreData) => {
    if (!houseId || !user) return;
    try {
      await choreService.completeChore(houseId, chore.choreId, user.uid);
      loadFairness();
      Alert.alert('Nice work!', 'Chore completed. Points added to your total.');
    } catch (err: any) {
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
            try {
              await choreService.deleteChore(houseId, chore.choreId, user.uid);
            } catch (err: any) {
              handleError(err, 'Unable to delete chore. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleReassignChore = async (chore: ChoreData, userId: string | null) => {
    if (!houseId || !user) return;
    try {
      await choreService.assignChore(houseId, chore.choreId, userId, user.uid);
    } catch (err: any) {
      handleError(err, 'Unable to reassign chore. Please try again.');
    }
  };

  const onRefresh = useCallback(async () => {
    if (!houseId) return;
    try {
      setRefreshing(true);
      await Promise.all([
        choreService.getHouseChores(houseId).then(setChores),
        loadFairness(),
      ]);
    } catch (err: any) {
      handleError(err, 'Unable to refresh chores.');
    } finally {
      setRefreshing(false);
    }
  }, [houseId, loadFairness, handleError]);

  const filteredAndSortedChores = useMemo(() => {
    let result = chores;

    if (statusFilter === 'pending') {
      result = result.filter((c) => c.status === 'pending' || c.status === 'overdue');
    } else if (statusFilter === 'completed') {
      result = result.filter((c) => c.status === 'completed');
    }

    return [...result].sort((a, b) =>
      sortByPointsDesc ? b.points - a.points : a.points - b.points
    );
  }, [chores, sortByPointsDesc, statusFilter]);

  const getAssignedName = (assignedTo: string | null) => {
    if (!assignedTo) return 'Unassigned';
    const member = members.find((m) => m.userId === assignedTo);
    return member?.name ?? 'Unassigned';
  };

  const renderStatusBadge = (status: ChoreData['status']) => {
    let label = 'Pending';
    let backgroundColor = '#E5E7EB';
    let color = BUTLER_BLUE;

    if (status === 'completed') {
      label = 'Completed';
      backgroundColor = '#DCFCE7';
      color = '#166534';
    } else if (status === 'overdue') {
      label = 'Overdue';
      backgroundColor = '#FEE2E2';
      color = '#B91C1C';
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
      </View>
    );
  };

  const renderLastCompleted = (chore: ChoreData) => {
    if (!chore.lastCompletedAt || !chore.lastCompletedBy) return null;
    const lastByName = getAssignedName(chore.lastCompletedBy);
    return (
      <Text style={styles.lastCompletedText}>
        Last completed by {lastByName} • {chore.totalCompletions} time
        {chore.totalCompletions === 1 ? '' : 's'}
      </Text>
    );
  };

  const renderChoreCard = ({ item }: { item: ChoreData }) => {
    const isPending = item.status === 'pending' || item.status === 'overdue';
    const assignedName = getAssignedName(item.assignedTo);
    const canComplete =
      isPending && (item.assignedTo === null || item.assignedTo === user?.uid);

    return (
      <View style={styles.choreCard}>
        <RNView style={styles.choreHeaderRow}>
          <RNView style={{ flex: 1 }}>
            <Text style={styles.choreTitle}>{item.title}</Text>
            {!!item.description && (
              <Text style={styles.choreDescription}>{item.description}</Text>
            )}
          </RNView>
          <RNView style={styles.choreHeaderRight}>
            {renderStatusBadge(item.status)}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() =>
                setOpenMenuChoreId((current) =>
                  current === item.choreId ? null : item.choreId
                )
              }
            >
              <Text style={styles.menuButtonText}>⋮</Text>
            </TouchableOpacity>
          </RNView>
        </RNView>

        <RNView style={styles.choreMetaRow}>
          <Text style={styles.choreMetaText}>+{item.points} pts</Text>
          <Text style={styles.choreMetaDivider}>•</Text>
          <Text style={styles.choreMetaText}>Assigned to {assignedName}</Text>
        </RNView>

        {renderLastCompleted(item)}

        {canComplete && (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={() => handleCompleteChore(item)}
          >
            <Text style={styles.completeButtonText}>Complete</Text>
          </TouchableOpacity>
        )}

        {openMenuChoreId === item.choreId && (
          <RNView style={styles.menuContainer}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setOpenMenuChoreId(null);
                openEditModal(item);
              }}
            >
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setOpenMenuChoreId(null);
                // Simple reassign cycle through members including Unassigned
                const allTargets: (string | null)[] = [
                  null,
                  ...members.map((m) => m.userId),
                ];
                const currentIndex = allTargets.indexOf(item.assignedTo ?? null);
                const nextIndex = (currentIndex + 1) % allTargets.length;
                handleReassignChore(item, allTargets[nextIndex]);
              }}
            >
              <Text style={styles.menuItemText}>Reassign</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setOpenMenuChoreId(null);
                handleDeleteChore(item);
              }}
            >
              <Text style={[styles.menuItemText, { color: '#B91C1C' }]}>
                Delete
              </Text>
            </Pressable>
          </RNView>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) {
      return null;
    }

    return (
      <RNView style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateTitle}>No chores yet</Text>
        <Text style={styles.emptyStateSubtitle}>
          Tap the + button to add your first task and get your house running like a well-oiled machine.
        </Text>
      </RNView>
    );
  };

  const renderFairnessBar = () => {
    if (!isInHouse) return null;

    if (fairnessLoading && !memberStats.length) {
      return (
        <RNView style={styles.fairnessContainer}>
          <Text style={styles.sectionTitle}>House Fairness</Text>
          <ActivityIndicator color={BUTLER_BLUE} />
        </RNView>
      );
    }

    if (!memberStats.length) {
      return null;
    }

    const maxPoints = Math.max(
      ...memberStats.map((m) => m.totalPoints),
      averagePoints ?? 0,
      1
    );

    return (
      <RNView style={styles.fairnessContainer}>
        <Text style={styles.sectionTitle}>House Fairness</Text>
        {averagePoints !== null && (
          <Text style={styles.fairnessSubtitle}>
            Average points: {Math.round(averagePoints)}
          </Text>
        )}

        {memberStats.map((member) => {
          const widthPercent = (member.totalPoints / maxPoints) * 100;
          const isCurrentUser = member.userId === user?.uid;
          return (
            <RNView key={member.userId} style={styles.fairnessRow}>
              <RNView style={styles.fairnessLabelColumn}>
                <Text
                  style={[
                    styles.fairnessMemberName,
                    isCurrentUser && styles.fairnessCurrentUserName,
                  ]}
                >
                  {member.userName}
                </Text>
                <Text style={styles.fairnessPointsText}>
                  {member.totalPoints} pts
                </Text>
              </RNView>
              <RNView style={styles.fairnessBarTrack}>
                <RNView
                  style={[
                    styles.fairnessBarFill,
                    {
                      width: `${widthPercent}%`,
                      backgroundColor: isCurrentUser ? GREEN_ACCENT : BUTLER_BLUE,
                    },
                  ]}
                />
              </RNView>
            </RNView>
          );
        })}
      </RNView>
    );
  };

  const renderFilters = () => (
    <RNView style={styles.filterRow}>
      <RNView style={styles.filterChipsContainer}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterChip,
              statusFilter === filter.value && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </RNView>

      <TouchableOpacity
        style={styles.sortButton}
        onPress={() => setSortByPointsDesc((prev) => !prev)}
      >
        <Text style={styles.sortButtonText}>
          {sortByPointsDesc ? 'Points ↓' : 'Points ↑'}
        </Text>
      </TouchableOpacity>
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
          <RNView style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingChore ? 'Edit Chore' : 'Add Chore'}
            </Text>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Fold laundry"
              placeholderTextColor={MUTED_TEXT}
              value={titleInput}
              onChangeText={setTitleInput}
            />

            <Text style={styles.modalLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Include any helpful details"
              placeholderTextColor={MUTED_TEXT}
              multiline
              value={descriptionInput}
              onChangeText={setDescriptionInput}
            />

            <RNView style={styles.row}>
              <RNView style={styles.rowItem}>
                <Text style={styles.modalLabel}>Points</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={pointsInput}
                  onChangeText={setPointsInput}
                />
              </RNView>
              <RNView style={[styles.rowItem, { marginLeft: 12 }]}>
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
              </RNView>
            </RNView>

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
                  Unassigned
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
                    {member.name}
                  </Text>
                </TouchableOpacity>
              ))}
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
                    {editingChore ? 'Save changes' : 'Add chore'}
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
            Chores live inside a house. Once you join or create a house, you’ll see all shared
            chores here.
          </Text>
        </RNView>
      </View>
    );
  }

  return (
    <View style={styles.container} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
      <FlatList
        data={filteredAndSortedChores}
        keyExtractor={(item) => item.choreId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <RNView>
            <Text style={styles.title}>Chores</Text>
            <Text style={styles.description}>
              Keep your home running smoothly by sharing tasks fairly across the house.
            </Text>
            {renderFairnessBar()}
            {renderFilters()}
          </RNView>
        }
        renderItem={renderChoreCard}
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
  choreCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: BORDER_RADIUS,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  choreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  choreHeaderRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  choreTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 4,
  },
  choreDescription: {
    fontSize: 14,
    color: MUTED_TEXT,
  },
  choreMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  choreMetaText: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  choreMetaDivider: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginHorizontal: 6,
  },
  lastCompletedText: {
    fontSize: 12,
    color: MUTED_TEXT,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  completeButton: {
    marginTop: 10,
    backgroundColor: GREEN_ACCENT,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  menuButtonText: {
    fontSize: 16,
    color: MUTED_TEXT,
  },
  menuContainer: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: BUTLER_BLUE,
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
  fairnessContainer: {
    backgroundColor: '#E5EAF0',
    borderRadius: BORDER_RADIUS,
    padding: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 4,
  },
  fairnessSubtitle: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  fairnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fairnessLabelColumn: {
    width: 120,
  },
  fairnessMemberName: {
    fontSize: 13,
    color: BUTLER_BLUE,
  },
  fairnessCurrentUserName: {
    fontWeight: '700',
  },
  fairnessPointsText: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  fairnessBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fairnessBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterChipsContainer: {
    flexDirection: 'row',
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#E5E7EB',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: BUTLER_BLUE,
  },
  filterChipText: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sortButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E5E7EB',
  },
  sortButtonText: {
    fontSize: 13,
    color: BUTLER_BLUE,
    fontWeight: '500',
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
  modalLabel: {
    fontSize: 13,
    color: MUTED_TEXT,
    marginBottom: 4,
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
    backgroundColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 6,
  },
  dropdownChipActive: {
    backgroundColor: BUTLER_BLUE,
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
