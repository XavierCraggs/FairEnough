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
import calendarService, {
  CalendarEventData,
  CalendarServiceError,
  RecurrenceFrequency,
  RecurrenceRule,
} from '../../services/calendarService';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';
const CARD_BACKGROUND = '#FFFFFF';
const MUTED_TEXT = '#6B7280';
const GREEN_ACCENT = '#16A34A';
const BORDER_RADIUS = 16;
const UPCOMING_DAYS = 60;

type EventOccurrence = {
  occurrenceId: string;
  occurrenceDate: Date;
  event: CalendarEventData;
  isRecurring: boolean;
};

const RECURRENCE_OPTIONS: { label: string; value: RecurrenceFrequency }[] = [
  { label: 'None', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

const normalizeDate = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

const addYears = (date: Date, years: number) =>
  new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string): Date | null => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export default function CalendarScreen() {
  const { user, userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;
  const currentUserId = user?.uid ?? null;

  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [dateInput, setDateInput] = useState(formatDateInput(new Date()));
  const [recurrenceInput, setRecurrenceInput] = useState<RecurrenceFrequency>('none');
  const [submitting, setSubmitting] = useState(false);

  const isInHouse = !!houseId;

  // TODO: Premium bi-directional calendar sync with Google/Apple.

  useEffect(() => {
    if (!houseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = calendarService.subscribeToEvents(houseId, (updated) => {
      setEvents(updated);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [houseId]);

  const handleError = useCallback((err: any, fallbackMessage: string) => {
    const serviceError = err as CalendarServiceError;
    const message = serviceError?.message || fallbackMessage;
    Alert.alert('Calendar', message);
  }, []);

  const openCreateModal = () => {
    if (!currentUserId) {
      Alert.alert('Calendar', 'You must be signed in to add an event.');
      return;
    }
    setTitleInput('');
    setDescriptionInput('');
    setDateInput(formatDateInput(new Date()));
    setRecurrenceInput('none');
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const handleSubmit = async () => {
    if (!houseId || !currentUserId) return;
    if (!titleInput.trim()) {
      Alert.alert('Calendar', 'Please enter an event title.');
      return;
    }

    const parsedDate = parseDateInput(dateInput);
    if (!parsedDate) {
      Alert.alert('Calendar', 'Use the format YYYY-MM-DD for the date.');
      return;
    }

    const recurrence: RecurrenceRule = {
      frequency: recurrenceInput,
      interval: 1,
    };

    setSubmitting(true);
    try {
      await calendarService.addEvent(
        houseId,
        currentUserId,
        titleInput,
        parsedDate,
        descriptionInput,
        recurrence
      );
      setModalVisible(false);
    } catch (err: any) {
      handleError(err, 'Unable to add event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = (event: CalendarEventData) => {
    if (!houseId || !currentUserId) return;
    const isRecurring = event.recurrence?.frequency !== 'none';
    Alert.alert(
      'Delete event',
      isRecurring
        ? 'Delete this recurring event series?'
        : `Delete "${event.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await calendarService.deleteEvent(houseId, event.eventId, currentUserId);
            } catch (err: any) {
              handleError(err, 'Unable to delete event.');
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
      const updated = await calendarService.getHouseEvents(houseId);
      setEvents(updated);
    } catch (err: any) {
      handleError(err, 'Unable to refresh events.');
    } finally {
      setRefreshing(false);
    }
  }, [houseId, handleError]);

  const eventOccurrences = useMemo(() => {
    const rangeStart = normalizeDate(new Date());
    const rangeEnd = addDays(rangeStart, UPCOMING_DAYS);

    const occurrences: EventOccurrence[] = [];

    events.forEach((event) => {
      const baseDate = normalizeDate(event.startDate.toDate());
      const recurrence = event.recurrence || { frequency: 'none', interval: 1 };
      const interval = Math.max(1, recurrence.interval || 1);

      if (recurrence.frequency === 'none') {
        if (baseDate >= rangeStart && baseDate <= rangeEnd) {
          occurrences.push({
            occurrenceId: `${event.eventId}-${formatDateInput(baseDate)}`,
            occurrenceDate: baseDate,
            event,
            isRecurring: false,
          });
        }
        return;
      }

      let current = baseDate;
      const advance = (date: Date) => {
        switch (recurrence.frequency) {
          case 'daily':
            return addDays(date, interval);
          case 'weekly':
            return addDays(date, interval * 7);
          case 'monthly':
            return addMonths(date, interval);
          case 'yearly':
            return addYears(date, interval);
          default:
            return addDays(date, interval);
        }
      };

      while (current < rangeStart) {
        current = advance(current);
      }

      while (current <= rangeEnd) {
        occurrences.push({
          occurrenceId: `${event.eventId}-${formatDateInput(current)}`,
          occurrenceDate: current,
          event,
          isRecurring: true,
        });
        current = advance(current);
      }
    });

    return occurrences.sort(
      (a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime()
    );
  }, [events]);

  const renderOccurrenceCard = ({ item }: { item: EventOccurrence }) => {
    const formattedDate = item.occurrenceDate.toLocaleDateString();
    const recurrenceLabel =
      item.event.recurrence?.frequency && item.event.recurrence.frequency !== 'none'
        ? item.event.recurrence.frequency
        : null;

    return (
      <RNView style={styles.eventCard}>
        <RNView style={styles.eventHeader}>
          <Text style={styles.eventTitle}>{item.event.title}</Text>
          <Text style={styles.eventDate}>{formattedDate}</Text>
        </RNView>
        {!!item.event.description && (
          <Text style={styles.eventDescription}>{item.event.description}</Text>
        )}
        <RNView style={styles.eventMetaRow}>
          <Text style={styles.eventMetaText}>
            Created by {item.event.createdByName}
          </Text>
          {recurrenceLabel && (
            <RNView style={styles.recurrenceBadge}>
              <Text style={styles.recurrenceBadgeText}>{recurrenceLabel}</Text>
            </RNView>
          )}
        </RNView>
        <RNView style={styles.eventActionsRow}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteEvent(item.event)}
          >
            <Text style={styles.deleteButtonText}>
              {item.isRecurring ? 'Delete series' : 'Delete'}
            </Text>
          </TouchableOpacity>
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
        <Text style={styles.emptyStateTitle}>No events scheduled</Text>
        <Text style={styles.emptyStateSubtitle}>
          Tap the + button to add rent day, inspections, or house guests.
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
            <Text style={styles.modalTitle}>Add Event</Text>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Rent due"
              placeholderTextColor={MUTED_TEXT}
              value={titleInput}
              onChangeText={setTitleInput}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Any details or reminders"
              placeholderTextColor={MUTED_TEXT}
              value={descriptionInput}
              onChangeText={setDescriptionInput}
              multiline
            />

            <Text style={styles.modalLabel}>Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={MUTED_TEXT}
              value={dateInput}
              onChangeText={setDateInput}
            />

            <Text style={styles.modalLabel}>Repeat</Text>
            <RNView style={styles.dropdownContainer}>
              {RECURRENCE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.dropdownChip,
                    recurrenceInput === option.value && styles.dropdownChipActive,
                  ]}
                  onPress={() => setRecurrenceInput(option.value)}
                >
                  <Text
                    style={[
                      styles.dropdownChipText,
                      recurrenceInput === option.value && styles.dropdownChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
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
                  <Text style={styles.modalPrimaryText}>Add event</Text>
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
            Calendar lives inside a house. Once you join or create a house, you will see shared
            events here.
          </Text>
        </RNView>
      </View>
    );
  }

  return (
    <View style={styles.container} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
      <FlatList
        data={eventOccurrences}
        keyExtractor={(item) => item.occurrenceId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <RNView>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.description}>
              Track shared house events, rent days, and important schedules in one place.
            </Text>
            <RNView style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              <Text style={styles.sectionSubtitle}>
                Next {UPCOMING_DAYS} days of shared events.
              </Text>
            </RNView>
          </RNView>
        }
        renderItem={renderOccurrenceCard}
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
    backgroundColor: '#E5EAF0',
    borderRadius: BORDER_RADIUS,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  eventCard: {
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
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BUTLER_BLUE,
    flex: 1,
    marginRight: 8,
  },
  eventDate: {
    fontSize: 13,
    color: MUTED_TEXT,
  },
  eventDescription: {
    fontSize: 14,
    color: MUTED_TEXT,
    marginBottom: 10,
  },
  eventMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventMetaText: {
    fontSize: 12,
    color: MUTED_TEXT,
  },
  recurrenceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#DCFCE7',
  },
  recurrenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  eventActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deleteButtonText: {
    color: '#B91C1C',
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

