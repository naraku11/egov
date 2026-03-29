/**
 * @file firebase.js
 * @description Lightweight Firebase Phone Auth token verifier.
 *
 * Replaces the firebase-admin SDK with a single REST call to the
 * Firebase Identity Toolkit API. This eliminates:
 *  - firebase-admin's persistent gRPC/HTTP2 connections to Google APIs
 *  - Internal worker threads for JWT crypto operations
 *  - 200+ transitive npm dependencies
 *
 * All of the above were holding entry-process slots on Hostinger shared
 * hosting, pushing the server above the 20-process limit.
 *
 * How it works:
 *   POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={WEB_API_KEY}
 *   Body: { idToken: "..." }
 *   → Returns the user record including phoneNumber if the token is valid.
 *
 * The Web API Key is the same key already in the frontend .env as
 * VITE_FIREBASE_API_KEY. Add it to the backend .env as FIREBASE_WEB_API_KEY.
 *
 * @param {string} idToken - Firebase Phone Auth ID token from the client.
 * @returns {{ phone_number: string|null, uid: string }} Decoded token claims.
 * @throws {Error} with .isExpired or .isInvalid flags for auth error handling.
 */
export const verifyFirebaseToken = async (idToken) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    const err = new Error('FIREBASE_WEB_API_KEY is not set — phone auth is unavailable');
    err.isUnconfigured = true;
    throw err;
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || 'Firebase token verification failed';
    const err = new Error(message);
    // Map Firebase REST error messages to the same flags the old Admin SDK used
    if (message === 'TOKEN_EXPIRED')  err.isExpired = true;
    else err.isInvalid = true;
    throw err;
  }

  const data = await res.json();
  const firebaseUser = data?.users?.[0];
  if (!firebaseUser) {
    const err = new Error('No user found in Firebase response');
    err.isInvalid = true;
    throw err;
  }

  return {
    phone_number: firebaseUser.phoneNumber || null,
    uid: firebaseUser.localId,
  };
};
