import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isWeb = Platform.OS === 'web';

const safeCall = async (fn: () => Promise<void>) => {
  if (isWeb) return;
  try {
    await fn();
  } catch {
    // Ignore haptics errors on unsupported devices.
  }
};

export const impactLight = () =>
  safeCall(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const impactMedium = () =>
  safeCall(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const selectionChanged = () =>
  safeCall(() => Haptics.selectionAsync());

export const notifySuccess = () =>
  safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const notifyWarning = () =>
  safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

export const notifyError = () =>
  safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
