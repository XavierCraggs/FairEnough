import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View as RNView } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/Themed';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AppTheme } from '@/constants/AppColors';

export interface ProfileOverviewUser {
  userId: string;
  name: string;
  photoUrl?: string | null;
  email?: string | null;
  subtitle?: string;
  stats?: Array<{ label: string; value: string }>;
}

interface ProfileOverviewModalProps {
  visible: boolean;
  user: ProfileOverviewUser | null;
  onClose: () => void;
}

const getInitial = (name: string) => (name.trim() ? name.trim()[0].toUpperCase() : '?');

const getFallbackColor = (userId: string, colors: AppTheme) => {
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

const ProfileOverviewModal: React.FC<ProfileOverviewModalProps> = ({
  visible,
  user,
  onClose,
}) => {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!user) {
    return null;
  }

  const fallbackColor = getFallbackColor(user.userId, colors);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <RNView style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <RNView style={styles.card}>
          <RNView style={styles.headerRow}>
            {user.photoUrl ? (
              <Image
                source={{ uri: user.photoUrl }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="disk"
                transition={150}
              />
            ) : (
              <RNView style={[styles.avatar, { backgroundColor: fallbackColor }]}>
                <Text style={styles.avatarText}>{getInitial(user.name)}</Text>
              </RNView>
            )}
            <RNView style={styles.headerMeta}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.subtitle}>
                {user.subtitle || 'Housemate'}
              </Text>
            </RNView>
          </RNView>

          {!!user.email && <Text style={styles.detailText}>{user.email}</Text>}

          {!!user.stats?.length && (
            <RNView style={styles.statsRow}>
              {user.stats.map((stat) => (
                <RNView key={stat.label} style={styles.statChip}>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statValue}>{stat.value}</Text>
                </RNView>
              ))}
            </RNView>
          )}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </RNView>
      </RNView>
    </Modal>
  );
};

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    backdropTap: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerMeta: {
      flex: 1,
      marginLeft: 12,
    },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.onAccent,
    fontSize: 22,
    fontWeight: '700',
  },
    name: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: colors.muted,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 10,
    },
    detailText: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 4,
    },
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
    },
    statChip: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginRight: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 110,
    },
    statLabel: {
      fontSize: 11,
      color: colors.muted,
      marginBottom: 2,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      marginTop: 16,
      paddingVertical: 10,
      borderRadius: 999,
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
    },
    closeText: {
      color: colors.accent,
      fontWeight: '600',
    },
  });

export default ProfileOverviewModal;
