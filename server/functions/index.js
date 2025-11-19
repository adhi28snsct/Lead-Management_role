// functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * HTTP Cloud Function for assigning roles.
 * Emulator URL:
 *   http://localhost:5001/lead-management-role/us-central1/assignRole
 *
 * Method: POST
 * Body JSON: { requesterUid, uid, role }
 */
exports.assignRole = functions.https.onRequest(async (req, res) => {
  // Basic CORS for local dev
  res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // preflight
    return res.status(204).send('');
  }

  console.log('assignRole called. Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Method not allowed' });
  }

  const { requesterUid, uid, role } = req.body || {};

  if (!requesterUid || !uid || !role) {
    console.log('Missing parameters', { requesterUid, uid, role });
    return res.status(400).json({
      success: false,
      error: 'Missing parameters. Expected { requesterUid, uid, role }',
    });
  }

  try {
    // 1. Check requester role from Firestore
    const requesterDocRef = db.doc(`users/${requesterUid}`);
    const requesterSnap = await requesterDocRef.get();
    const requesterRole = requesterSnap.exists
      ? requesterSnap.data().role
      : null;

    console.log('requesterRole:', requesterRole);

    if (requesterRole !== 'Admin') {
      console.log('Permission denied: requester is not Admin');
      return res
        .status(403)
        .json({ success: false, error: 'Only Admins can assign roles.' });
    }

    // 2. Update target user document in Firestore
    const targetUserRef = db.doc(`users/${uid}`);
    await targetUserRef.set(
      {
        role,
        // 🔥 FIX: use plain JS timestamp instead of serverTimestamp()
        lastModified: Date.now(),
      },
      { merge: true }
    );
    console.log('Updated Firestore user doc for', uid);

    return res.status(200).json({
      success: true,
      message: `Role updated to ${role}`,
    });
  } catch (err) {
    console.error('assignRole INTERNAL ERROR:', err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : 'Internal server error',
    });
  }
});
