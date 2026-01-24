// contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { auth, db } from '../api/firebase';
import { UserData } from '../services/authService';
import premiumService from '../services/premiumService';

/**
 * Auth context value interface
 */
interface AuthContextValue {
  user: User | null;
  userProfile: UserData | null;
  loading: boolean;
  isAuthenticated: boolean;
}

/**
 * Auth context - provides authentication state to entire app
 */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  loading: true,
  isAuthenticated: false,
});

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 * 
 * @returns AuthContextValue
 * @throws Error if used outside AuthProvider
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

/**
 * Auth Provider component
 * Manages authentication state and automatic navigation
 * 
 * Features:
 * - Listens to Firebase auth state changes
 * - Fetches and syncs user profile from Firestore
 * - Automatically redirects based on auth state
 * - Prevents flash of wrong screen during initial load
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialNavigationDone, setInitialNavigationDone] = useState(false);
  const missingProfileAlerted = useRef(false);
  
  const router = useRouter();
  const segments = useSegments();

  /**
   * Listen to Firebase auth state changes
   * Sets up real-time listener for user login/logout
   */
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      // Clear profile if user logs out
      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return unsubscribeAuth;
  }, []);

  /**
   * Listen to Firestore user profile changes
   * Sets up real-time listener for user document updates
   */
  useEffect(() => {
    if (!user) {
      return;
    }

    // Subscribe to user document for real-time updates
    const unsubscribeProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setUserProfile(docSnapshot.data() as UserData);
        } else {
          console.warn('User profile document does not exist');
          setUserProfile(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching user profile:', error);
        setLoading(false);
      }
    );

    return unsubscribeProfile;
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const registerForPushNotifications = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          return;
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        if (!projectId) {
          console.warn('Expo push projectId is missing; skipping push token registration.');
          return;
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });

        if (tokenResponse?.data) {
          await setDoc(
            doc(db, 'users', user.uid),
            {
              expoPushToken: tokenResponse.data,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (error) {
        console.error('Push notification registration failed:', error);
      }
    };

    registerForPushNotifications();
  }, [user]);

  useEffect(() => {
    const syncRevenueCat = async () => {
      if (!user || !userProfile) {
        await premiumService.reset();
        return;
      }

      if (!userProfile.houseId) {
        await premiumService.reset();
        return;
      }

      try {
        await premiumService.syncHouse({
          houseId: userProfile.houseId,
          userId: user.uid,
          userName: userProfile.name,
        });
      } catch (error) {
        console.warn('RevenueCat sync failed:', error);
      }
    };

    syncRevenueCat();
  }, [user, userProfile?.houseId, userProfile?.name, userProfile]);

  /**
   * Automatic navigation based on auth state
   * Redirects users to appropriate screens based on authentication
   * 
   * Rules:
   * - Logged out -> redirect to (auth)
   * - Logged in without house -> redirect to (auth)/house-setup
   * - Logged in with house -> redirect to (tabs)/index
   * - Prevents redirect loops by checking current location
   */
  useEffect(() => {
    // Don't navigate until we know the auth state
    if (loading) {
      return;
    }

    // Get the first segment to determine if we're in auth or main app
    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const onHouseSetup = segments[1] === 'house-setup';

    /**
     * Navigation logic:
     *
     * Case 1: User is logged out
     * - If not already in auth screens, redirect to welcome
     *
     * Case 2: User is logged in
     * - If user has no house -> redirect to house-setup
     * - If user has house -> redirect to main app
     * - Don't redirect if already on the correct screen
     */
    if (!user && !inAuthGroup) {
      // User is logged out but not on auth screen -> redirect to welcome
      router.replace('/(auth)');
      setInitialNavigationDone(true);
    } else if (user && userProfile === null) {
      // User is signed in but profile is missing -> treat as logged out
      if (!missingProfileAlerted.current) {
        missingProfileAlerted.current = true;
        Alert.alert(
          'Account not found',
          'We could not load your profile. Please sign in again.'
        );
      }
      if (!inAuthGroup) {
        router.replace('/(auth)');
      }
      setInitialNavigationDone(true);
    } else if (user && userProfile !== null) {
      // User is logged in and profile is loaded
      const hasHouse = userProfile.houseId !== null;

      if (!hasHouse && !onHouseSetup) {
        // User has no house and not on house-setup -> redirect to house-setup
        router.replace('/(auth)/house-setup');
        setInitialNavigationDone(true);
      } else if (hasHouse && (onHouseSetup || inAuthGroup)) {
        // User has house but on auth screens -> redirect to main app
        router.replace('/(tabs)/');
        setInitialNavigationDone(true);
      } else if (!initialNavigationDone && hasHouse && !inTabsGroup) {
        // Initial load, user has house, not in tabs -> redirect to main app
        router.replace('/(tabs)/');
        setInitialNavigationDone(true);
      } else if (!initialNavigationDone) {
        // Mark navigation as done even if no redirect happened
        setInitialNavigationDone(true);
      }
    } else if (!initialNavigationDone) {
      // Mark navigation as done even if no redirect happened
      // This prevents infinite loops
      setInitialNavigationDone(true);
    }
  }, [user, userProfile, segments, loading, initialNavigationDone]);

  /**
   * Context value provided to children
   */
  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    isAuthenticated: !!user && !!userProfile,
  };

  /**
   * Show nothing during initial load to prevent screen flash
   * Once we know auth state, show the appropriate screen
   */
  if (loading && !initialNavigationDone) {
    return null; // Or return a loading screen component
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
