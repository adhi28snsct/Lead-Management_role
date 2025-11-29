const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Allowed roles 
const ALLOWED_ROLES = ['Admin', 'TeamAdmin', 'Master', 'Executive'];

// =======================
//  RUNTIME CONFIG
// =======================
const runtimeConfig = functions.config() || {};
const SMTP_CONFIG = runtimeConfig.smtp || {};
const APP_CONFIG = runtimeConfig.app || {};

// CORS origin (set in functions config or env)
const CORS_ORIGIN =
  APP_CONFIG.origin ||
  process.env.CORS_ORIGIN ||
  'http://localhost:3000';

// Internal notification email (for lead notifications)
const NOTIFICATION_EMAIL =
  APP_CONFIG.notification_email ||
  SMTP_CONFIG.notify ||
  SMTP_CONFIG.from ||
  SMTP_CONFIG.user ||
  null;

// =======================
//  SMTP CONFIG (SECURE)
// =======================
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

// Read from firebase functions config
// Set them using:
// firebase functions:config:set smtp.user="..." smtp.pass="..." smtp.from="..." app.origin="https://yourdomain.com" app.notification_email="notifications@yourdomain.com"
const SMTP_USER = SMTP_CONFIG.user;
const SMTP_PASS = SMTP_CONFIG.pass;
const SMTP_FROM = SMTP_CONFIG.from || SMTP_USER;

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// =======================
//  RATE LIMIT CONFIG
// =======================
const ASSIGN_ROLE_RATE_LIMIT_PER_HOUR = 20; // max role changes per admin per hour

async function checkAssignRoleRateLimit(uid) {
  try {
    const docRef = db.doc(`rateLimits/assignRole_${uid}`);
    const snap = await docRef.get();
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (!snap.exists) {
      await docRef.set({
        count: 1,
        windowStart: now,
      });
      return true;
    }

    const data = snap.data() || {};
    const windowStart = data.windowStart
      ? data.windowStart.toDate()
      : new Date(0);
    let count = data.count || 0;

    // reset window if older than 1h
    if (windowStart < oneHourAgo) {
      await docRef.set({
        count: 1,
        windowStart: now,
      });
      return true;
    }

    if (count >= ASSIGN_ROLE_RATE_LIMIT_PER_HOUR) {
      console.warn(
        `Rate limit exceeded for assignRole by uid=${uid}. count=${count}`
      );
      return false;
    }

    await docRef.update({
      count: count + 1,
    });

    return true;
  } catch (err) {
    console.error('Error in checkAssignRoleRateLimit:', err);
    // In case of error, fail CLOSED (deny)
    return false;
  }
}

// Helper to send email (INTERNAL ONLY)
async function sendEmail({ subject, text, html }) {
  if (!NOTIFICATION_EMAIL) {
    console.log(
      'No NOTIFICATION_EMAIL configured. Skipping email send for subject:',
      subject
    );
    return;
  }

  if (!SMTP_USER || !SMTP_PASS) {
    console.error(
      'SMTP credentials are not set in functions config. Skipping email.'
    );
    return;
  }

  // Basic length safety
  const safeSubject = (subject || '').toString().slice(0, 200);
  const safeText = (text || '').toString().slice(0, 4000);
  const safeHtml = (html || safeText || '').toString().slice(0, 8000);

  const mailOptions = {
    from: SMTP_FROM,
    to: NOTIFICATION_EMAIL, // Always internal recipient to avoid abuse
    subject: safeSubject,
    text: safeText,
    html: safeHtml,
  };

  console.log('Sending internal notification email. Subject:', safeSubject);
  await transporter.sendMail(mailOptions);
  console.log('Email sent successfully');
}

/**
 * HTTP Cloud Function for assigning roles.
 */
exports.assignRole = functions.https.onRequest(async (req, res) => {
  // --- Basic CORS (origin from config) ---
  res.set('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    // Preflight request
    return res.status(204).send('');
  }

  console.log('assignRole called. Method:', req.method);

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Method not allowed' });
  }

  // --- 1. Verify ID token of requester ---
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);

  if (!match) {
    console.log('Missing or invalid Authorization header');
    return res.status(401).json({
      success: false,
      error:
        'Unauthorized. Expected Authorization: Bearer <ID_TOKEN> header.',
    });
  }

  const idToken = match[1];

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error('Error verifying ID token:', err);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired ID token',
    });
  }

  const requesterUid = decodedToken.uid;
  const tokenRole = decodedToken.role || null;
  console.log('Requester UID from token:', requesterUid);

  // --- 2. Parse body and validate input ---
  let { uid, role } = req.body || {};

  if (typeof uid !== 'string' || typeof role !== 'string') {
    console.log('Invalid parameter types for uid/role');
    return res.status(400).json({
      success: false,
      error: 'Invalid parameter types. uid and role must be strings.',
    });
  }

  uid = uid.trim();
  role = role.trim();

  if (!uid || !role) {
    console.log('Missing parameters', { uid, role });
    return res.status(400).json({
      success: false,
      error: 'Missing parameters. Expected { uid, role }',
    });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    console.log('Invalid role requested:', role);
    return res.status(400).json({
      success: false,
      error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}`,
    });
  }

  // --- 2.1 Rate limiting (per admin) ---
  const allowedByRateLimit = await checkAssignRoleRateLimit(requesterUid);
  if (!allowedByRateLimit) {
    return res.status(429).json({
      success: false,
      error: 'Too many role changes. Please try again later.',
    });
  }

  try {
    // --- 3. Check requester role from Firestore ---
    const requesterDocRef = db.doc(`users/${requesterUid}`);
    const requesterSnap = await requesterDocRef.get();
    const requesterRole = requesterSnap.exists
      ? requesterSnap.data().role
      : null;

    console.log('requesterRole (from Firestore):', requesterRole);

    // Require Admin in either Firestore or token custom claims
    const isAdminFromFirestore = requesterRole === 'Admin';
    const isAdminFromToken = tokenRole === 'Admin';

    if (!isAdminFromFirestore && !isAdminFromToken) {
      console.log(
        'Permission denied: requester is not Admin in Firestore or token claims'
      );
      return res.status(403).json({
        success: false,
        error: 'Only Admins can assign roles.',
      });
    }

    // --- 3.1 Ensure target user exists ---
    let userRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
    } catch (err) {
      console.error('Target uid not found in Firebase Auth:', err);
      return res.status(400).json({
        success: false,
        error: 'Target user does not exist.',
      });
    }

    if (userRecord.disabled) {
      console.log('Target user is disabled:', uid);
      return res.status(400).json({
        success: false,
        error: 'Cannot assign role to a disabled user.',
      });
    }

    // --- 4. Update target user document in Firestore ---
    const targetUserRef = db.doc(`users/${uid}`);
    await targetUserRef.set(
      {
        role,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log('Updated Firestore user doc for', uid);

    // --- 5. Merge custom claims (do not overwrite others) ---
    const existingClaims = userRecord.customClaims || {};
    const newClaims = {
      ...existingClaims,
      role,
    };

    await admin.auth().setCustomUserClaims(uid, newClaims);
    console.log('Custom claims set for user', uid, 'role:', role);

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

// -------------------------------------------------
// Firestore Trigger: New Lead -> Email Notification
// (Internal notification only)
// -------------------------------------------------
exports.sendLeadNotification = functions.firestore
  .document('teams/{teamId}/leads/{leadId}')
  .onCreate(async (snapshot, context) => {
    const lead = snapshot.data() || {};
    const { teamId, leadId } = context.params;

    console.log(
      'sendLeadNotification triggered for team:',
      teamId,
      'lead:',
      leadId
    );

    // If you want per-team notification email, you can read team doc here.
    // For now we always use NOTIFICATION_EMAIL (internal).
    if (!NOTIFICATION_EMAIL) {
      console.log(
        'No NOTIFICATION_EMAIL configured. Skipping new lead notification.'
      );
      return null;
    }

    const subject = `New Lead Created: ${lead.name || leadId}`;
    const text = `
A new lead has been created.

Team ID: ${teamId}
Lead ID: ${leadId}

Name: ${lead.name || 'N/A'}
Email (lead): ${lead.email || 'N/A'}
Contact Number: ${lead.contactNumber || 'N/A'}
Source: ${lead.source || 'N/A'}
Status: ${lead.status || 'N/A'}
Notes: ${lead.notes || 'N/A'}

Created At: ${
      lead.createdAt && lead.createdAt.toDate
        ? lead.createdAt.toDate().toISOString()
        : 'serverTimestamp()'
    }
    `.trim();

    try {
      await sendEmail({
        subject,
        text,
      });
    } catch (err) {
      console.error('Error sending new lead email notification:', err);
    }

    return null;
  });

// ------------------------------------------------------------------
// Firestore Trigger: Lead Status Change -> Email Notification
// (Internal notification only, with anti-spam guard)
// ------------------------------------------------------------------
exports.sendLeadStatusChangeNotification = functions.firestore
  .document('teams/{teamId}/leads/{leadId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const { teamId, leadId } = context.params;

    const oldStatus = before.status;
    const newStatus = after.status;

    if (oldStatus === newStatus) {
      console.log('Lead status did not change. No email sent.');
      return null;
    }

    console.log(
      'sendLeadStatusChangeNotification triggered for team:',
      teamId,
      'lead:',
      leadId,
      'status:',
      oldStatus,
      '->',
      newStatus
    );

    if (!NOTIFICATION_EMAIL) {
      console.log(
        'No NOTIFICATION_EMAIL configured. Skipping lead status change notification.'
      );
      return null;
    }

    // Anti-spam: only send if lastStatusEmailAt is older than 10 minutes
    const MIN_INTERVAL_MS = 10 * 60 * 1000;
    const nowMs = Date.now();

    let lastStatusEmailAtMs = 0;
    if (before.lastStatusEmailAt && before.lastStatusEmailAt.toDate) {
      lastStatusEmailAtMs = before.lastStatusEmailAt
        .toDate()
        .getTime();
    }

    if (lastStatusEmailAtMs && nowMs - lastStatusEmailAtMs < MIN_INTERVAL_MS) {
      console.log(
        'Status change notification suppressed due to rate limit (per lead).'
      );
      return null;
    }

    const subject = `Lead Status Updated: ${after.name || leadId}`;
    const text = `
Lead status has been updated.

Team ID: ${teamId}
Lead ID: ${leadId}

Name: ${after.name || 'N/A'}
Email (lead): ${after.email || 'N/A'}

Old Status: ${oldStatus || 'N/A'}
New Status: ${newStatus || 'N/A'}

Notes: ${after.notes || 'N/A'}

Last Modified At: ${
      after.lastModified && after.lastModified.toDate
        ? after.lastModified.toDate().toISOString()
        : 'serverTimestamp()'
    }
    `.trim();

    try {
      await sendEmail({
        subject,
        text,
      });

      // Update lastStatusEmailAt to prevent spam
      await change.after.ref.set(
        {
          lastStatusEmailAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error(
        'Error sending lead status change email notification:',
        err
      );
    }

    return null;
  });
