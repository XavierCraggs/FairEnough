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
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View as RNView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text, View } from '@/components/Themed';
import { useAuth } from '../../contexts/AuthContext';
import calendarService, {
  CalendarEventData,
  CalendarServiceError,
  RecurrenceFrequency,
} from '../../services/calendarService';
import {
  impactLight,
  impactMedium,
  notifyError,
  notifyWarning,
  selectionChanged,
} from '@/utils/haptics';

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

const formatReadableDate = (date: Date) => date.toLocaleDateString();

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { user, userProfile } = useAuth();
  const houseId = userProfile?.houseId ?? null;
  const currentUserId = user?.uid ?? null;

  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventData | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(normalizeDate(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recurrenceInput, setRecurrenceInput] = useState<RecurrenceFrequency>('none');
  const [endDateEnabled, setEndDateEnabled] = useState(false);
  const [endDateInput, setEndDateInput] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState<Date>(normalizeDate(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(
    normalizeDate(new Date())
  );

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

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      setShowDatePicker(false);
      setShowEndDatePicker(false);
    });

    return () => subscription.remove();
  }, []);

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
    setEditingEvent(null);
    setTitleInput('');
    setDescriptionInput('');
    setSelectedDate(normalizeDate(new Date()));
    setShowDatePicker(false);
    setRecurrenceInput('none');
    setEndDateEnabled(false);
    setEndDateInput(null);
    setShowEndDatePicker(false);
    impactLight();
    setModalVisible(true);
  };

  const openEditModal = (event: CalendarEventData) => {
    if (!currentUserId) {
      Alert.alert('Calendar', 'You must be signed in to edit an event.');
      return;
    }
    setEditingEvent(event);
    setTitleInput(event.title);
    setDescriptionInput(event.description || '');
    setSelectedDate(normalizeDate(event.startDate.toDate()));
    setShowDatePicker(false);
    setShowEndDatePicker(false);
    const frequency = event.recurrence?.frequency || 'none';
    setRecurrenceInput(frequency);
    const endDate =
      event.recurrence?.endDate?.toDate && event.recurrence.endDate.toDate();
    if (endDate) {
      setEndDateEnabled(true);
      setEndDateInput(normalizeDate(endDate));
    } else {
      setEndDateEnabled(false);
      setEndDateInput(null);
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const handleDateChange = (_event: any, date?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(normalizeDate(date));
      if (endDateInput && normalizeDate(date) > normalizeDate(endDateInput)) {
        setEndDateInput(normalizeDate(date));
      }
    }
  };

  const handleEndDateChange = (_event: any, date?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowEndDatePicker(false);
    }
    if (date) {
      const normalized = normalizeDate(date);
      const eventDate = normalizeDate(selectedDate);
      setEndDateInput(normalized < eventDate ? eventDate : normalized);
    }
  };

  const handleSubmit = async () => {
    if (!houseId || !currentUserId) return;
    if (!titleInput.trim()) {
      Alert.alert('Calendar', 'Please enter an event title.');
      return;
    }
    const eventDate = normalizeDate(selectedDate);
    const endDate =
      endDateEnabled && endDateInput ? normalizeDate(endDateInput) : null;
    const safeEndDate = endDate && endDate < eventDate ? eventDate : endDate;

    setSubmitting(true);
    try {
      if (editingEvent) {
        await calendarService.updateEvent(
          houseId,
          editingEvent.eventId,
          {
            title: titleInput,
            description: descriptionInput,
            startDate: eventDate,
            recurrence: {
              frequency: recurrenceInput,
              interval: 1,
              endDate: safeEndDate,
            },
          },
          currentUserId
        );
      } else {
        await calendarService.addEvent(
          houseId,
          currentUserId,
          titleInput,
          eventDate,
          descriptionInput,
          {
            frequency: recurrenceInput,
            interval: 1,
            endDate: safeEndDate,
          }
        );
      }
      impactMedium();
      setModalVisible(false);
    } catch (err: any) {
      notifyError();
      handleError(
        err,
        editingEvent
          ? 'Unable to update event. Please try again.'
          : 'Unable to add event. Please try again.'
      );
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
            notifyWarning();
            try {
              await calendarService.deleteEvent(houseId, event.eventId, currentUserId);
            } catch (err: any) {
              notifyError();
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

  const handlePreviousMonth = () => {
    const previous = addMonths(calendarMonth, -1);
    setCalendarMonth(previous);
    setSelectedCalendarDate(new Date(previous.getFullYear(), previous.getMonth(), 1));
  };

  const handleNextMonth = () => {
    const next = addMonths(calendarMonth, 1);
    setCalendarMonth(next);
    setSelectedCalendarDate(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const handleSelectCalendarDate = (date: Date) => {
    selectionChanged();
    setSelectedCalendarDate(normalizeDate(date));
  };

  const eventOccurrences = useMemo(() => {
    const rangeStart = normalizeDate(new Date());
    const rangeEnd = addDays(rangeStart, UPCOMING_DAYS);

    const occurrences: EventOccurrence[] = [];

    events.forEach((event) => {
      const baseDate = normalizeDate(event.startDate.toDate());
      const recurrence = event.recurrence || {
        frequency: 'none',
        interval: 1,
        endDate: null,
      };
      const interval = Math.max(1, recurrence.interval || 1);
      const recurrenceEnd = recurrence.endDate?.toDate
        ? normalizeDate(recurrence.endDate.toDate())
        : null;
      const effectiveRangeEnd =
        recurrenceEnd && recurrenceEnd < rangeEnd ? recurrenceEnd : rangeEnd;

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

      if (recurrenceEnd && recurrenceEnd < rangeStart) {
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

      while (current <= effectiveRangeEnd) {
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

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>();
    eventOccurrences.forEach((occurrence) => {
      const key = formatDateInput(occurrence.occurrenceDate);
      const existing = map.get(key) || [];
      map.set(key, [...existing, occurrence]);
    });
    return map;
  }, [eventOccurrences]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const startDayOfWeek = monthStart.getDay();

    const days: Array<Date | null> = [];
    for (let i = 0; i < startDayOfWeek; i += 1) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push(new Date(year, month, day));
    }

    const rows: Array<Array<Date | null>> = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [calendarMonth]);

  const selectedDateKey = formatDateInput(selectedCalendarDate);
  const selectedDateOccurrences = occurrencesByDate.get(selectedDateKey) || [];

  const renderOccurrenceCard = ({ item }: { item: EventOccurrence }) => {
    const formattedDate = item.occurrenceDate.toLocaleDateString();
    const recurrenceLabel =
      item.event.recurrence?.frequency && item.event.recurrence.frequency !== 'none'
        ? item.event.recurrence.frequency
        : null;
    const recurrenceEnd = item.event.recurrence?.endDate?.toDate
      ? formatReadableDate(item.event.recurrence.endDate.toDate())
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
          <RNView>
            <Text style={styles.eventMetaText}>
              Created by {item.event.createdByName}
            </Text>
            {recurrenceEnd && (
              <Text style={styles.eventMetaText}>Repeats until {recurrenceEnd}</Text>
            )}
          </RNView>
          {recurrenceLabel && (
            <RNView style={styles.recurrenceBadge}>
              <Text style={styles.recurrenceBadgeText}>{recurrenceLabel}</Text>
            </RNView>
          )}
        </RNView>
        <RNView style={styles.eventActionsRow}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(item.event)}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
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

  const renderCalendarGrid = () => {
    const monthLabel = `${MONTH_LABELS[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;
    return (
      <RNView style={styles.calendarContainer}>
        <RNView style={styles.calendarHeaderRow}>
          <TouchableOpacity style={styles.calendarNavButton} onPress={handlePreviousMonth}>
            <Text style={styles.calendarNavText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.calendarMonthText}>{monthLabel}</Text>
          <TouchableOpacity style={styles.calendarNavButton} onPress={handleNextMonth}>
            <Text style={styles.calendarNavText}>{'>'}</Text>
          </TouchableOpacity>
        </RNView>
        <RNView style={styles.calendarWeekRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.calendarWeekdayText}>
              {label}
            </Text>
          ))}
        </RNView>
        {calendarDays.map((week, index) => (
          <RNView key={`week-${index}`} style={styles.calendarWeekRow}>
            {week.map((date, dayIndex) => {
              if (!date) {
                return <RNView key={`empty-${dayIndex}`} style={styles.calendarDayCell} />;
              }
              const key = formatDateInput(date);
              const eventsForDay = occurrencesByDate.get(key) || [];
              const isSelected = key === formatDateInput(selectedCalendarDate);
              const isToday = key === formatDateInput(normalizeDate(new Date()));

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.calendarDayCell,
                    isSelected && styles.calendarDaySelected,
                  ]}
                  onPress={() => handleSelectCalendarDate(date)}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      isToday && styles.calendarDayToday,
                      isSelected && styles.calendarDaySelectedText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  <RNView style={styles.calendarDotsRow}>
                    {eventsForDay.slice(0, 3).map((event, dotIndex) => (
                      <RNView
                        key={`${event.occurrenceId}-${dotIndex}`}
                        style={styles.calendarDot}
                      />
                    ))}
                  </RNView>
                </Pressable>
              );
            })}
          </RNView>
        ))}
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

  const renderSelectedDateEmptyState = () => (
    <RNView style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateTitle}>No events this day</Text>
      <Text style={styles.emptyStateSubtitle}>
        Try another date or add a new event.
      </Text>
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <RNView style={styles.modalContent}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Add Event</Text>
              {editingEvent && (
                <Text style={styles.modalSubtitle}>Edits apply to the whole series.</Text>
              )}

              <Text style={styles.modalLabel}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Rent due"
                placeholderTextColor={MUTED_TEXT}
                value={titleInput}
                onChangeText={setTitleInput}
                onFocus={() => {
                  setShowDatePicker(false);
                  setShowEndDatePicker(false);
                }}
              />

              <Text style={styles.modalLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Any details or reminders"
                placeholderTextColor={MUTED_TEXT}
                value={descriptionInput}
                onChangeText={setDescriptionInput}
                onFocus={() => {
                  setShowDatePicker(false);
                  setShowEndDatePicker(false);
                }}
                multiline
              />

              <Text style={styles.modalLabel}>Date</Text>
              <Pressable
                style={styles.datePickerButton}
                onPress={() => {
                  setShowEndDatePicker(false);
                  setShowDatePicker((prev) => !prev);
                }}
              >
                <Text style={styles.datePickerText}>{formatReadableDate(selectedDate)}</Text>
              </Pressable>
              {showDatePicker && (
                <RNView style={styles.datePickerShell}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
                    textColor={Platform.OS === 'ios' ? BUTLER_BLUE : undefined}
                    onChange={handleDateChange}
                  />
                </RNView>
              )}

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

              {recurrenceInput === 'none' ? (
                <Text style={styles.modalHelperText}>
                  Recurring events can include an end date.
                </Text>
              ) : (
                <>
                  <Text style={styles.modalLabel}>Repeat ends</Text>
                  <RNView style={styles.dropdownContainer}>
                    <Pressable
                      style={[
                        styles.dropdownChip,
                        !endDateEnabled && styles.dropdownChipActive,
                      ]}
                      onPress={() => {
                        setEndDateEnabled(false);
                        setEndDateInput(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownChipText,
                          !endDateEnabled && styles.dropdownChipTextActive,
                        ]}
                      >
                        No end
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.dropdownChip,
                        endDateEnabled && styles.dropdownChipActive,
                      ]}
                      onPress={() => {
                        setEndDateEnabled(true);
                        setEndDateInput((current) => current ?? selectedDate);
                        setShowDatePicker(false);
                        setShowEndDatePicker(true);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownChipText,
                          endDateEnabled && styles.dropdownChipTextActive,
                        ]}
                      >
                        End date
                      </Text>
                    </Pressable>
                  </RNView>
                  {endDateEnabled && (
                    <>
                      <Pressable
                        style={styles.datePickerButton}
                        onPress={() => {
                          setShowDatePicker(false);
                          setShowEndDatePicker((prev) => !prev);
                        }}
                      >
                        <Text style={styles.datePickerText}>
                          {endDateInput ? formatReadableDate(endDateInput) : 'Select end date'}
                        </Text>
                      </Pressable>
                      {showEndDatePicker && endDateInput && (
                        <RNView style={styles.datePickerShell}>
                          <DateTimePicker
                            value={endDateInput}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                            themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
                            textColor={Platform.OS === 'ios' ? BUTLER_BLUE : undefined}
                            onChange={handleEndDateChange}
                          />
                        </RNView>
                      )}
                    </>
                  )}
                </>
              )}

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
                      {editingEvent ? 'Save changes' : 'Add event'}
                    </Text>
                  )}
                </TouchableOpacity>
              </RNView>
            </ScrollView>
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
      {viewMode === 'list' ? (
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
              <RNView style={styles.toggleRow}>
                <Pressable
                  style={[
                    styles.toggleButton,
                    viewMode === 'list' && styles.toggleButtonActive,
                  ]}
                  onPress={() => {
                    selectionChanged();
                    setViewMode('list');
                  }}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      viewMode === 'list' && styles.toggleButtonTextActive,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.toggleButton,
                    viewMode === 'calendar' && styles.toggleButtonActive,
                  ]}
                  onPress={() => {
                    selectionChanged();
                    setViewMode('calendar');
                  }}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      viewMode === 'calendar' && styles.toggleButtonTextActive,
                    ]}
                  >
                    Calendar
                  </Text>
                </Pressable>
              </RNView>
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
      ) : (
        <FlatList
          data={selectedDateOccurrences}
          keyExtractor={(item) => item.occurrenceId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <RNView>
              <Text style={styles.title}>Calendar</Text>
              <Text style={styles.description}>
                Pick a date to see shared events and schedules.
              </Text>
              <RNView style={styles.toggleRow}>
                <Pressable
                  style={[
                    styles.toggleButton,
                    viewMode === 'list' && styles.toggleButtonActive,
                  ]}
                  onPress={() => {
                    selectionChanged();
                    setViewMode('list');
                  }}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      viewMode === 'list' && styles.toggleButtonTextActive,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.toggleButton,
                    viewMode === 'calendar' && styles.toggleButtonActive,
                  ]}
                  onPress={() => {
                    selectionChanged();
                    setViewMode('calendar');
                  }}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      viewMode === 'calendar' && styles.toggleButtonTextActive,
                    ]}
                  >
                    Calendar
                  </Text>
                </Pressable>
              </RNView>
              {renderCalendarGrid()}
              <RNView style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  Events on {formatReadableDate(selectedCalendarDate)}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {selectedDateOccurrences.length
                    ? `${selectedDateOccurrences.length} event${
                        selectedDateOccurrences.length === 1 ? '' : 's'
                      }`
                    : 'No events for this date.'}
                </Text>
              </RNView>
            </RNView>
          }
          renderItem={renderOccurrenceCard}
          ListEmptyComponent={renderSelectedDateEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BUTLER_BLUE} />
          }
        />
      )}

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
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleButtonText: {
    fontSize: 13,
    color: MUTED_TEXT,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: BUTLER_BLUE,
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
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BORDER_RADIUS,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarNavButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  calendarNavText: {
    fontSize: 16,
    color: BUTLER_BLUE,
    fontWeight: '600',
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '600',
    color: BUTLER_BLUE,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarWeekdayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    color: MUTED_TEXT,
  },
  calendarDayCell: {
    width: 36,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: {
    fontSize: 13,
    color: BUTLER_BLUE,
    fontWeight: '600',
  },
  calendarDaySelected: {
    backgroundColor: BUTLER_BLUE,
  },
  calendarDaySelectedText: {
    color: '#FFFFFF',
  },
  calendarDayToday: {
    color: GREEN_ACCENT,
  },
  calendarDotsRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: BUTLER_BLUE,
    marginHorizontal: 1,
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
    maxHeight: '90%',
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
    marginTop: 6,
  },
  modalScrollContent: {
    paddingBottom: 12,
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
  datePickerButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  datePickerShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
    overflow: 'hidden',
  },
  datePickerText: {
    fontSize: 14,
    color: BUTLER_BLUE,
    fontWeight: '500',
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

