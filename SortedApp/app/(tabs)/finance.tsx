import { StyleSheet, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';

export default function FinanceScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.title}>Finance</Text>
        <Text style={styles.description}>
          Track all house bills and expenses here. See who owes what, split costs fairly, and manage shared financial responsibilities.
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

