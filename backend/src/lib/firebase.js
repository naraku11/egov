/**
 * @file firebase.js
 * @description Firebase Admin SDK initialization for server-side token verification.
 *
 * Uses a service account JSON file downloaded from:
 * Firebase Console → Project Settings → Service accounts → Generate new private key
 *
 * Set the FIREBASE_SERVICE_ACCOUNT_PATH env var to the path of the JSON file,
 * or place it at backend/firebase-service-account.json (gitignored).
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let firebaseApp = null;

/**
 * Lazily initializes the Firebase Admin app.
 * Returns the admin.auth() instance for token verification.
 */
export const getFirebaseAuth = () => {
  if (!firebaseApp) {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      || path.join(process.cwd(), 'firebase-service-account.json');

    if (!fs.existsSync(saPath)) {
      console.warn('⚠️  Firebase service account not found at:', saPath);
      console.warn('   Phone OTP via Firebase will not work until configured.');
      return null;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin.auth();
};
