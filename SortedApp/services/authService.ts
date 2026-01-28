// services/authService.ts
  import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    updateEmail,
    User,
    UserCredential,
    AuthError,
    FacebookAuthProvider,
    GoogleAuthProvider,
    fetchSignInMethodsForEmail,
    signInWithCredential,
    OAuthProvider,
  } from 'firebase/auth';
  import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
  import { auth, db } from '../api/firebase';
  
  /**
   * Custom error type for auth service
   */
  export interface AuthServiceError {
    code: string;
    message: string;
    originalError?: AuthError;
  }
  
  /**
   * User data structure stored in Firestore
   */
  export interface UserData {
    uid: string;
    email: string;
    name: string;
    houseId: string | null;
    totalPoints: number;
    photoUrl?: string | null;
    phone?: string | null;
    createdAt: any;
    updatedAt: any;
  }
  
  /**
   * Authentication service for handling user auth operations
   * Implements Firebase Auth with Firestore user profile management
   */
  class AuthService {
    /**
     * Get the currently authenticated user
     * @returns Current user or null if not authenticated
     */
    getCurrentUser(): User | null {
      return auth.currentUser;
    }
  
    /**
     * Register a new user with email and password
     * Creates both Firebase Auth user and Firestore user document
     * 
     * @param email - User's email address
     * @param password - User's password (min 6 characters)
     * @param name - User's display name
     * @returns UserCredential on success
     * @throws AuthServiceError on failure
     */
    async signUp(
      email: string,
      password: string,
      name: string
    ): Promise<UserCredential> {
      try {
        // Input validation
        if (!email || !password || !name) {
          throw new Error('Email, password, and name are required');
        }
        
        const trimmedPassword = password.trim();
        if (trimmedPassword.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        if (!/[A-Za-z]/.test(trimmedPassword) || !/\d/.test(trimmedPassword)) {
          throw new Error('Password must include at least one letter and one number');
        }
  
        const normalizedEmail = email.trim().toLowerCase();
        const existingProviders = await fetchSignInMethodsForEmail(auth, normalizedEmail);
        if (existingProviders.length > 0) {
          const error: Partial<AuthError> = {
            code: 'auth/email-already-in-use',
            message: 'This email is already registered. Please sign in instead.',
          };
          throw error;
        }
  
        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          normalizedEmail,
          trimmedPassword
        );
  
        // Update user profile with display name
        await updateProfile(userCredential.user, {
          displayName: name.trim(),
        });
  
        // Create Firestore user document
        await this.createUserDocument(userCredential.user, name.trim());
  
        return userCredential;
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Sign in existing user with email and password
     * 
     * @param email - User's email address
     * @param password - User's password
     * @returns UserCredential on success
     * @throws AuthServiceError on failure
     */
    async signIn(email: string, password: string): Promise<UserCredential> {
      try {
        if (!email || !password) {
          throw new Error('Email and password are required');
        }
  
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email.trim().toLowerCase(),
          password
        );
  
        return userCredential;
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Sign in with Google OAuth
     * Platform-specific implementation required (see comments)
     * 
     * @param idToken - Google ID token from platform-specific auth
     * @returns UserCredential on success
     * @throws AuthServiceError on failure
     */
    async signInWithGoogle(idToken: string): Promise<UserCredential> {
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
  
        // Check if this is a new user and create Firestore document
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (!userDoc.exists()) {
          await this.createUserDocument(
            userCredential.user,
            userCredential.user.displayName || 'User'
          );
        }
  
        return userCredential;
      } catch (error) {
        if ((error as AuthError)?.code === 'auth/account-exists-with-different-credential') {
          const email = (error as any)?.customData?.email as string | undefined;
          const methods = email ? await fetchSignInMethodsForEmail(auth, email) : [];
          throw this.buildAccountExistsError(methods);
        }
        throw this.handleAuthError(error);
      }
    }

    /**
     * Sign in with Facebook OAuth
     * Platform-specific implementation required (see comments)
     *
     * @param accessToken - Facebook access token
     * @returns UserCredential on success
     * @throws AuthServiceError on failure
     */
    async signInWithFacebook(accessToken: string): Promise<UserCredential> {
      try {
        const credential = FacebookAuthProvider.credential(accessToken);
        const userCredential = await signInWithCredential(auth, credential);

        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (!userDoc.exists()) {
          await this.createUserDocument(
            userCredential.user,
            userCredential.user.displayName || 'User'
          );
        }

        return userCredential;
      } catch (error) {
        if ((error as AuthError)?.code === 'auth/account-exists-with-different-credential') {
          const email = (error as any)?.customData?.email as string | undefined;
          const methods = email ? await fetchSignInMethodsForEmail(auth, email) : [];
          throw this.buildAccountExistsError(methods);
        }
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Sign in with Apple OAuth
     * Platform-specific implementation required (see comments)
     * 
     * @param idToken - Apple ID token from platform-specific auth
     * @param nonce - Nonce used in the Apple sign-in flow
     * @returns UserCredential on success
     * @throws AuthServiceError on failure
     */
    async signInWithApple(idToken: string, nonce: string): Promise<UserCredential> {
      try {
        const provider = new OAuthProvider('apple.com');
        const credential = provider.credential({
          idToken,
          rawNonce: nonce,
        });
  
        const userCredential = await signInWithCredential(auth, credential);
  
        // Check if this is a new user and create Firestore document
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (!userDoc.exists()) {
          await this.createUserDocument(
            userCredential.user,
            userCredential.user.displayName || 'User'
          );
        }
  
        return userCredential;
      } catch (error) {
        if ((error as AuthError)?.code === 'auth/account-exists-with-different-credential') {
          const email = (error as any)?.customData?.email as string | undefined;
          const methods = email ? await fetchSignInMethodsForEmail(auth, email) : [];
          throw this.buildAccountExistsError(methods);
        }
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Sign out the current user
     * 
     * @throws AuthServiceError on failure
     */
    async signOut(): Promise<void> {
      try {
        await signOut(auth);
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Send password reset email
     * 
     * @param email - User's email address
     * @throws AuthServiceError on failure
     */
    async resetPassword(email: string): Promise<void> {
      try {
        if (!email) {
          throw new Error('Email is required');
        }
  
        await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Get user data from Firestore
     * 
     * @param uid - User's unique ID
     * @returns UserData or null if not found
     * @throws AuthServiceError on failure
     */
    async getUserData(uid: string): Promise<UserData | null> {
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        
        if (!userDoc.exists()) {
          return null;
        }
  
        return userDoc.data() as UserData;
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Update user's display name
     * Updates both Firebase Auth profile and Firestore document
     * 
     * @param name - New display name
     * @throws AuthServiceError on failure
     */
    async updateUserName(name: string): Promise<void> {
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('No authenticated user');
        }
  
        // Update Firebase Auth profile
        await updateProfile(user, {
          displayName: name.trim(),
        });
  
        // Update Firestore document
        await setDoc(
          doc(db, 'users', user.uid),
          {
            name: name.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }

    /**
     * Update user's email address
     * Updates both Firebase Auth and Firestore document
     * 
     * @param email - New email
     * @throws AuthServiceError on failure
     */
    async updateUserEmail(email: string): Promise<void> {
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('No authenticated user');
        }

        if (!email.trim()) {
          throw new Error('Email is required');
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (user.email?.toLowerCase() !== normalizedEmail) {
          const existingProviders = await fetchSignInMethodsForEmail(auth, normalizedEmail);
          if (existingProviders.length > 0) {
            const error: Partial<AuthError> = {
              code: 'auth/email-already-in-use',
              message: 'This email is already registered. Please use another email.',
            };
            throw error;
          }
        }

        await updateEmail(user, normalizedEmail);

        await setDoc(
          doc(db, 'users', user.uid),
          {
            email: normalizedEmail,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        throw this.handleAuthError(error);
      }
    }
  
    /**
     * Create initial user document in Firestore
     * Called automatically after successful registration
     * 
     * @param user - Firebase Auth user
     * @param name - User's display name
     * @private
     */
    private async createUserDocument(user: User, name: string): Promise<void> {
      const userData: UserData = {
        uid: user.uid,
        email: user.email || '',
        name: name,
        houseId: null,
        totalPoints: 0,
        photoUrl: user.photoURL || null,
        phone: user.phoneNumber || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
  
      await setDoc(doc(db, 'users', user.uid), userData);
    }
  
    /**
     * Centralized error handling for auth operations
     * Converts Firebase errors into user-friendly messages
     * 
     * @param error - Error from Firebase or custom error
     * @returns AuthServiceError with user-friendly message
     * @private
     */
    private handleAuthError(error: any): AuthServiceError {
      // Handle Firebase Auth errors
      if (error.code) {
        const authError = error as AuthError;
        
        switch (authError.code) {
          case 'auth/email-already-in-use':
            return {
              code: authError.code,
              message: 'This email is already registered. Please sign in instead.',
              originalError: authError,
            };
          
          case 'auth/account-exists-with-different-credential':
            return {
              code: authError.code,
              message:
                'This email is already linked to another sign-in method. Please sign in with that method and link this provider in Settings.',
              originalError: authError,
            };

          case 'auth/credential-already-in-use':
            return {
              code: authError.code,
              message: 'This sign-in method is already linked to another account.',
              originalError: authError,
            };
          
          case 'auth/invalid-email':
            return {
              code: authError.code,
              message: 'Invalid email address. Please check and try again.',
              originalError: authError,
            };
          
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            return {
              code: authError.code,
              message: 'Invalid email or password. Please try again.',
              originalError: authError,
            };
          
          case 'auth/weak-password':
            return {
              code: authError.code,
              message: 'Password is too weak. Use at least 6 characters.',
              originalError: authError,
            };
          
          case 'auth/too-many-requests':
            return {
              code: authError.code,
              message: 'Too many failed attempts. Please try again later.',
              originalError: authError,
            };

          case 'auth/requires-recent-login':
            return {
              code: authError.code,
              message: 'Please sign in again before updating sensitive account details.',
              originalError: authError,
            };
          
          case 'auth/network-request-failed':
            return {
              code: authError.code,
              message: 'Network error. Please check your connection.',
              originalError: authError,
            };
          
          case 'auth/popup-closed-by-user':
            return {
              code: authError.code,
              message: 'Sign-in cancelled. Please try again.',
              originalError: authError,
            };
          
          default:
            return {
              code: authError.code,
              message: 'An unexpected error occurred. Please try again.',
              originalError: authError,
            };
        }
      }
  
      // Handle custom errors
      if (error instanceof Error) {
        return {
          code: 'custom-error',
          message: error.message,
        };
      }
  
      // Fallback for unknown errors
      return {
        code: 'unknown-error',
        message: 'An unexpected error occurred. Please try again.',
      };
    }
  }

  private buildAccountExistsError(methods: string[]): AuthServiceError {
    const pretty = methods
      .map((method) => {
        if (method === 'password') return 'email/password';
        if (method === 'google.com') return 'Google';
        if (method === 'facebook.com') return 'Facebook';
        if (method === 'apple.com') return 'Apple';
        return method;
      })
      .join(', ');

    const suffix = pretty ? ` Try signing in with: ${pretty}.` : '';
    return {
      code: 'auth/account-exists-with-different-credential',
      message:
        'This email is already linked to another sign-in method.' +
        suffix +
        ' You can link providers later in Settings.',
    };
  }
  
  // Export singleton instance
  export default new AuthService();
