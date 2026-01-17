import { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  View as RNView,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import houseService, { HouseData } from '@/services/houseService';
import choreService from '@/services/choreService';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/api/firebase';
import * as Clipboard from 'expo-clipboard';

const BACKGROUND_COLOR = '#F8FAF9';
const BUTLER_BLUE = '#4A6572';
const MUTED_TEXT = '#6B7280';

interface Member {
  userId: string;
  name: string;
  totalPoints: number;
}

interface FairnessData {
  averagePoints: number;
  memberStats: Array<{
    userId: string;
    userName: string;
    totalPoints: number;
    deviation: number;
  }>;
}

export default function DashboardScreen() {
  const { userProfile, user } = useAuth();
  const userName = userProfile?.name || 'User';
  const houseId = userProfile?.houseId;
  const currentUserId = user?.uid;

  const [houseData, setHouseData] = useState<HouseData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [fairnessData, setFairnessData] = useState<FairnessData | null>(null);
  const [loadingHouse, setLoadingHouse] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingFairness, setLoadingFairness] = useState(true);

  // Fetch house data
  useEffect(() => {
    if (!houseId) {
      setLoadingHouse(false);
      return;
    }

    const fetchHouse = async () => {
      try {
        const house = await houseService.getHouse(houseId);
        console.log('House data loaded:', house);
        setHouseData(house);
      } catch (error) {
        console.error('Error fetching house:', error);
        Alert.alert('Error', 'Failed to load house data');
      } finally {
        setLoadingHouse(false);
      }
    };

    fetchHouse();
  }, [houseId]);

  // Real-time members subscription
  useEffect(() => {
    if (!houseId) {
      setLoadingMembers(false);
      return;
    }

    setLoadingMembers(true);
    const membersQuery = query(
      collection(db, 'users'),
      where('houseId', '==', houseId)
    );

    const unsubscribe = onSnapshot(
      membersQuery,
      (snapshot) => {
        const membersList: Member[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            userId: doc.id,
            name: data.name || 'Unknown',
            totalPoints: data.totalPoints || 0,
          };
        });
        setMembers(membersList);
        setLoadingMembers(false);
      },
      (error) => {
        console.error('Error fetching members:', error);
        setLoadingMembers(false);
      }
    );

    return unsubscribe;
  }, [houseId]);

  // Calculate fairness
  useEffect(() => {
    if (!houseId) {
      setLoadingFairness(false);
      return;
    }

    const calculateFairness = async () => {
      try {
        setLoadingFairness(true);
        const fairness = await choreService.calculateHouseFairness(houseId);
        setFairnessData(fairness);
      } catch (error) {
        console.error('Error calculating fairness:', error);
      } finally {
        setLoadingFairness(false);
      }
    };

    calculateFairness();
  }, [houseId, members]);

  const handleCopyInviteCode = async () => {
    if (!houseData?.inviteCode) return;

    try {
      await Clipboard.setStringAsync(houseData.inviteCode);
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy invite code');
    }
  };

  const handleAddChore = () => {
    router.push('/(tabs)/chores');
  };

  const handleLeaveHouse = () => {
    if (!houseId || !currentUserId) return;

    Alert.alert(
      'Leave House',
      'Are you sure you want to leave this house? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await houseService.leaveHouse(currentUserId, houseId);
              router.replace('/(auth)/house-setup');
            } catch (error: any) {
              console.error('Error leaving house:', error);
              Alert.alert('Error', error.message || 'Failed to leave house');
            }
          },
        },
      ]
    );
  };

  const getCurrentUserDeviation = () => {
    if (!fairnessData || !currentUserId) return null;
    const currentUserStat = fairnessData.memberStats.find(
      (stat) => stat.userId === currentUserId
    );
    return currentUserStat?.deviation ?? null;
  };

  const currentUserDeviation = getCurrentUserDeviation();

  // No house case
  if (!houseId) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
          <Text style={styles.greeting}>Welcome back, {userName}!</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>No House</Text>
            <Text style={styles.description}>
              You're not in a house yet. Join an existing house or create a new one to get started.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/(auth)/house-setup')}
            >
              <Text style={styles.primaryButtonText}>Set Up House</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content} lightColor={BACKGROUND_COLOR} darkColor={BACKGROUND_COLOR}>
        <Text style={styles.greeting}>Welcome back, {userName}!</Text>

        {/* House Information */}
        {loadingHouse ? (
          <View style={styles.section}>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : houseData ? (
          <View style={styles.section}>
            <Text style={styles.houseName}>{houseData.name}</Text>
            <RNView style={styles.inviteCodeContainer}>
              <Text style={styles.inviteCodeLabel}>Invite Code:</Text>
              <RNView style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeText}>{houseData.inviteCode}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyInviteCode}
                >
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </RNView>
            </RNView>
            <Text style={styles.memberCount}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </Text>
          </View>
        ) : null}

        {/* House Fairness Summary */}
        {loadingFairness ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : fairnessData && currentUserDeviation !== null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Fairness</Text>
            <Text style={styles.fairnessAverage}>
              Average: {Math.round(fairnessData.averagePoints)} points
            </Text>
            <RNView style={styles.fairnessStatus}>
              <Text
                style={[
                  styles.fairnessStatusText,
                  currentUserDeviation >= 0 ? styles.fairnessPositive : styles.fairnessNegative,
                ]}
              >
                {currentUserDeviation >= 0 ? '✓' : '⚠'} You're{' '}
                {Math.abs(Math.round(currentUserDeviation))} points{' '}
                {currentUserDeviation >= 0 ? 'above' : 'behind'} average
              </Text>
            </RNView>
          </View>
        ) : null}

        {/* Members List */}
        {loadingMembers ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Members</Text>
            <ActivityIndicator size="small" color={BUTLER_BLUE} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>House Members</Text>
            {members.length === 0 ? (
              <Text style={styles.description}>No members found</Text>
            ) : (
              members.map((member) => (
                <RNView key={member.userId} style={styles.memberRow}>
                  <RNView style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.name}
                      {member.userId === currentUserId && (
                        <Text style={styles.youBadge}> (You)</Text>
                      )}
                    </Text>
                    <Text style={styles.memberPoints}>{member.totalPoints} points</Text>
                  </RNView>
                </RNView>
              ))
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleAddChore}>
            <Text style={styles.actionButtonText}>Add Chore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDanger]}
            onPress={handleLeaveHouse}
          >
            <Text style={[styles.actionButtonText, styles.actionButtonDangerText]}>
              Leave House
            </Text>
          </TouchableOpacity>
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
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: MUTED_TEXT,
    lineHeight: 24,
    marginBottom: 16,
  },
  houseName: {
    fontSize: 24,
    fontWeight: '700',
    color: BUTLER_BLUE,
    marginBottom: 16,
  },
  inviteCodeContainer: {
    marginBottom: 12,
  },
  inviteCodeLabel: {
    fontSize: 14,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: BUTLER_BLUE,
    letterSpacing: 2,
  },
  copyButton: {
    backgroundColor: BUTLER_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  memberCount: {
    fontSize: 16,
    color: MUTED_TEXT,
  },
  fairnessAverage: {
    fontSize: 16,
    color: MUTED_TEXT,
    marginBottom: 8,
  },
  fairnessStatus: {
    marginTop: 8,
  },
  fairnessStatusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fairnessPositive: {
    color: '#16A34A',
  },
  fairnessNegative: {
    color: '#DC2626',
  },
  memberRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  memberInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: BUTLER_BLUE,
  },
  youBadge: {
    fontSize: 14,
    color: MUTED_TEXT,
    fontWeight: '400',
  },
  memberPoints: {
    fontSize: 16,
    color: MUTED_TEXT,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: BUTLER_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: BUTLER_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonDanger: {
    backgroundColor: '#DC2626',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonDangerText: {
    color: '#FFFFFF',
  },
});
