import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../api/firebase';

export enum ProfileServiceErrorCode {
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  INVALID_INPUT = 'INVALID_INPUT',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

export interface ProfileServiceError {
  code: ProfileServiceErrorCode;
  message: string;
  originalError?: any;
}

const createError = (
  code: ProfileServiceErrorCode,
  message: string,
  originalError?: any
): ProfileServiceError => ({ code, message, originalError });

const profileService = {
  async uploadProfilePhoto(userId: string, uri: string): Promise<string> {
    try {
      if (!userId || !uri) {
        throw createError(
          ProfileServiceErrorCode.INVALID_INPUT,
          'User ID and photo are required.'
        );
      }

      const user = auth.currentUser;
      if (!user) {
        throw createError(
          ProfileServiceErrorCode.NOT_AUTHENTICATED,
          'You must be signed in to update your profile photo.'
        );
      }

      const response = await fetch(uri);
      const blob = await response.blob();
      const timestamp = Date.now();
      const storageRef = ref(storage, `profilePhotos/${userId}/${timestamp}.jpg`);

      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      await updateProfile(user, { photoURL: downloadUrl });
      await setDoc(
        doc(db, 'users', userId),
        {
          photoUrl: downloadUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return downloadUrl;
    } catch (error) {
      if ((error as ProfileServiceError)?.code) {
        throw error;
      }
      throw createError(
        ProfileServiceErrorCode.UPLOAD_FAILED,
        'Unable to upload profile photo.',
        error
      );
    }
  },
};

export default profileService;
