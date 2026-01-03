import { StyleSheet, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function DashboardScreen() {
  const { userProfile } = useAuth();
  const userName = userProfile?.name || 'User';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.greeting}>Welcome back, {userName}!</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>House Health</Text>
          <Text style={styles.description}>
            The fairness bar showing overall house contribution balance will appear here.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Task</Text>
          <Text style={styles.description}>
            Your next assigned chore or task will be displayed here.
          </Text>
        </View>
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
  greeting: {
    fontSize: 28,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 32,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: BUTLER_BLUE,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
});
