
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Allowed roles 
const ALLOWED_ROLES = ['Admin', 'TeamAdmin', 'Master', 'Executive'];


const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

const SMTP_USER = 'adhithyaarul28@gmail.com';         
const SMTP_PASS = 'hxzevvdgubolwpwj';              
const SMTP_FROM = 'adhithyaarul28@gmail.com';          
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

// Helper to send email
async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    console.log('No "to" address provided, skipping email send.');
    return;
  }

  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    text,
    html: html || text,
  };

  console.log('Sending email to:', to, 'subject:', subject);
  await transporter.sendMail(mailOptions);
  console.log('Email sent successfully');
}

/**
 * HTTP Cloud Function for assigning roles.
 */
exports.assignRole = functions.https.onRequest(async (req, res) => {
  // --- Basic CORS (adjust origin for production) ---
  res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    // Preflight request
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
  console.log('Requester UID from token:', requesterUid);

  // --- 2. Parse body and validate input ---
  const { uid, role } = req.body || {};

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

  try {
    // --- 3. Check requester role from Firestore ---
    const requesterDocRef = db.doc(`users/${requesterUid}`);
    const requesterSnap = await requesterDocRef.get();
    const requesterRole = requesterSnap.exists
      ? requesterSnap.data().role
      : null;

    console.log('requesterRole:', requesterRole);

    if (requesterRole !== 'Admin') {
      console.log('Permission denied: requester is not Admin');
      return res.status(403).json({
        success: false,
        error: 'Only Admins can assign roles.',
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

    // --- 5. Set custom claims ---
    await admin.auth().setCustomUserClaims(uid, { role });
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
// -------------------------------------------------
exports.sendLeadNotification = functions.firestore
  .document('teams/{teamId}/leads/{leadId}')
  .onCreate(async (snapshot, context) => {
    const lead = snapshot.data();
    const { teamId, leadId } = context.params;

    console.log('sendLeadNotification triggered for team:', teamId, 'lead:', leadId);
    console.log('Lead data:', lead);

    const notificationEmail = lead.email;

    if (!notificationEmail) {
      console.log('No lead.email found. Skipping email.');
      return null;
    }

    const subject = `New Lead Created: ${lead.name || leadId}`;
    const text = `
A new lead has been created.

Team ID: ${teamId}
Lead ID: ${leadId}

Name: ${lead.name || 'N/A'}
Email: ${lead.email || 'N/A'}
Contact Number: ${lead.contactNumber || 'N/A'}
Source: ${lead.source || 'N/A'}
Status: ${lead.status || 'N/A'}
Notes: ${lead.notes || 'N/A'}

Created At: ${lead.createdAt || 'serverTimestamp()'}
    `.trim();

    try {
      await sendEmail({
        to: notificationEmail,
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
// ------------------------------------------------------------------
exports.sendLeadStatusChangeNotification = functions.firestore
  .document('teams/{teamId}/leads/{leadId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
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

    const notificationEmail = after.email;

    if (!notificationEmail) {
      console.log('No lead email found on status update. Skipping email.');
      return null;
    }

    const subject = `Lead Status Updated: ${after.name || leadId}`;
    const text = `
Lead status has been updated.

Team ID: ${teamId}
Lead ID: ${leadId}

Name: ${after.name || 'N/A'}
Email: ${after.email || 'N/A'}

Old Status: ${oldStatus || 'N/A'}
New Status: ${newStatus || 'N/A'}

Notes: ${after.notes || 'N/A'}

Last Modified At: ${after.lastModified || 'serverTimestamp()'}
    `.trim();

    try {
      await sendEmail({
        to: notificationEmail,
        subject,
        text,
      });
    } catch (err) {
      console.error('Error sending lead status change email notification:', err);
    }

    return null;
  });
