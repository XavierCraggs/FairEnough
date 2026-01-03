// contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { auth, db } from '../api/firebase';
import { UserData } from '../services/authService';

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

  /**
   * Automatic navigation based on auth state
   * Redirects users to appropriate screens based on authentication
   * 
   * Rules:
   * - Logged out → redirect to (auth)/login
   * - Logged in → redirect to (tabs)/index
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

    /**
     * Navigation logic:
     * 
     * Case 1: User is logged out
     * - If not already in auth screens, redirect to login
     * 
     * Case 2: User is logged in
     * - If in auth screens, redirect to main app
     * - If nowhere (initial load), redirect to main app
     */
    if (!user && !inAuthGroup) {
      // User is logged out but not on auth screen → redirect to login
      router.replace('/(auth)/login');
      setInitialNavigationDone(true);
    } else if (user && (inAuthGroup || !initialNavigationDone)) {
      // User is logged in but on auth screen or initial load → redirect to main app
      router.replace('/(tabs)/');
      setInitialNavigationDone(true);
    } else if (!initialNavigationDone) {
      // Mark navigation as done even if no redirect happened
      // This prevents infinite loops
      setInitialNavigationDone(true);
    }
  }, [user, segments, loading, initialNavigationDone]);

  /**
   * Context value provided to children
   */
  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    isAuthenticated: !!user,
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