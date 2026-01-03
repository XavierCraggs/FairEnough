import { StyleSheet, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function CalendarScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.description}>
          View and manage shared house events, schedules, and important dates. Coordinate with your housemates and never miss an event.
        </Text>
      </View>
    </ScrollView>
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
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
});

