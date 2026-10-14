const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// -------------------------------------------------------------
// Helper: Generate Secure Unambiguous Caregiver Code
// -------------------------------------------------------------
function generateUnambiguousCode() {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const bytes = crypto.randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(bytes[i] % chars.length);
    }
    return "CG-" + code;
}

// -------------------------------------------------------------
// Helper: Transactional Rate Limiter per User & IP
// -------------------------------------------------------------
async function checkRateLimit(uid, action, maxCalls, windowMs, reqIp) {
    const now = Date.now();
    const docId = uid ? `user_${uid}_${action}` : `ip_${(reqIp || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}_${action}`;
    const ref = db.collection("users").doc(uid || "global").collection("rateLimits").doc(docId);

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(ref);
        if (doc.exists) {
            const data = doc.data();
            const windowStart = data.windowStart || 0;
            let count = data.count || 0;

            if (now - windowStart < windowMs) {
                if (count >= maxCalls) {
                    throw new functions.https.HttpsError(
                        "resource-exhausted",
                        `Rate limit exceeded for ${action}. Please wait before trying again.`
                    );
                }
                transaction.update(ref, {
                    count: count + 1,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                transaction.set(ref, {
                    count: 1,
                    windowStart: now,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } else {
            transaction.set(ref, {
                count: 1,
                windowStart: now,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

// Helper: Clean Invalid FCM Tokens
async function cleanupInvalidToken(userId, deviceId) {
    try {
        if (userId && deviceId) {
            await db.collection("users").doc(userId).collection("devices").doc(deviceId).delete();
        }
    } catch (e) {
        // Silent cleanup
    }
}

// -------------------------------------------------------------
// AI Proxy Cloud Functions Removed (All AI features now run client-side using per-user Gemini API keys)
// -------------------------------------------------------------



// -------------------------------------------------------------
// 2. EMERGENCY SOS ALERT
// -------------------------------------------------------------
exports.sendSOSAlert = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const patientId = context.auth.uid;
    const reqIp = context.rawRequest ? context.rawRequest.ip : "";
    await checkRateLimit(patientId, "sendSOSAlert", 3, 5 * 60 * 1000, reqIp);

    const emergencyContactPhone = data.emergencyContactPhone ? String(data.emergencyContactPhone).slice(0, 30) : "";

    try {
        const alertRef = await db.collection("users").doc(patientId).collection("caregiverAlerts").add({
            patientId,
            type: "SOS",
            message: `🚨 EMERGENCY SOS triggered`,
            status: "ACTIVE",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Get linked authorized caregivers
        const caregiversSnap = await db.collection("users").doc(patientId).collection("authorizedCaregivers")
            .where("status", "==", "approved").get();

        const tokensToNotify = [];
        for (const doc of caregiversSnap.docs) {
            const caregiverId = doc.id;
            const devicesSnap = await db.collection("users").doc(caregiverId).collection("devices").get();
            devicesSnap.forEach(devDoc => {
                const devData = devDoc.data();
                if (devData.token) {
                    tokensToNotify.push({ userId: caregiverId, deviceId: devDoc.id, token: devData.token });
                }
            });
        }

        let pushSentCount = 0;
        if (tokensToNotify.length > 0) {
            const messaging = admin.messaging();
            const rawTokens = tokensToNotify.map(t => t.token);

            const response = await messaging.sendEachForMulticast({
                tokens: rawTokens,
                notification: {
                    title: `🚨 EMERGENCY SOS`,
                    body: `Emergency SOS button pressed by patient!`
                },
                data: { type: "SOS", patientId, alertId: alertRef.id }
            });

            pushSentCount = response.successCount;
            response.responses.forEach((res, idx) => {
                if (!res.success && res.error) {
                    const errCode = res.error.code;
                    if (
                        errCode === "messaging/invalid-registration-token" ||
                        errCode === "messaging/registration-token-not-registered"
                    ) {
                        const t = tokensToNotify[idx];
                        cleanupInvalidToken(t.userId, t.deviceId);
                    }
                }
            });
        }

        let smsStatus = "disabled";
        const twilioEnabled = process.env.TWILIO_ENABLED === "true" || functions.config().twilio?.enabled === "true";

        if (twilioEnabled && emergencyContactPhone) {
            try {
                const twilio = require("twilio");
                const accountSid = process.env.TWILIO_ACCOUNT_SID || functions.config().twilio?.sid;
                const authToken = process.env.TWILIO_AUTH_TOKEN || functions.config().twilio?.token;
                const fromPhone = process.env.TWILIO_PHONE_NUMBER || functions.config().twilio?.phone;

                if (accountSid && authToken && fromPhone) {
                    const client = twilio(accountSid, authToken);
                    await client.messages.create({
                        body: `🚨 MediCare SOS Alert triggered. Please check immediately.`,
                        from: fromPhone,
                        to: emergencyContactPhone
                    });
                    smsStatus = "sent";
                }
            } catch (smsErr) {
                smsStatus = "failed";
            }
        }

        return {
            success: true,
            alertId: alertRef.id,
            caregiversNotified: tokensToNotify.length,
            pushSentCount,
            smsStatus
        };
    } catch (err) {
        throw new functions.https.HttpsError("internal", "Failed to process emergency alert.");
    }
});

// -------------------------------------------------------------
// 3. CAREGIVER CODE MANAGEMENT (Admin SDK Server-Only)
// -------------------------------------------------------------
exports.regenerateCaregiverCode = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = context.auth.uid;
    await checkRateLimit(uid, "regenerateCaregiverCode", 5, 60 * 1000);

    const newCode = generateUnambiguousCode();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours Expiry

    await db.collection("users").doc(uid).update({
        caregiverCode: newCode,
        caregiverCodeExpiresAt: expiresAt
    });

    return { caregiverCode: newCode, expiresAt: expiresAt.toDate().toISOString() };
});

exports.requestCaregiverLink = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const caregiverId = context.auth.uid;
    const reqIp = context.rawRequest ? context.rawRequest.ip : "";
    await checkRateLimit(caregiverId, "requestCaregiverLink", 5, 15 * 60 * 1000, reqIp);

    const { caregiverCode } = data;
    if (!caregiverCode || typeof caregiverCode !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Caregiver code is required.");
    }

    const codeClean = caregiverCode.trim().toUpperCase();
    const snap = await db.collection("users").where("caregiverCode", "==", codeClean).limit(1).get();

    if (snap.empty) {
        throw new functions.https.HttpsError("not-found", "Invalid or expired caregiver code.");
    }

    const patientDoc = snap.docs[0];
    const patientId = patientDoc.id;
    const patientData = patientDoc.data();

    if (patientId === caregiverId) {
        throw new functions.https.HttpsError("invalid-argument", "You cannot request a link to your own patient profile.");
    }

    // Verify expiration if present
    if (patientData.caregiverCodeExpiresAt) {
        const expMs = patientData.caregiverCodeExpiresAt.toMillis ? patientData.caregiverCodeExpiresAt.toMillis() : new Date(patientData.caregiverCodeExpiresAt).getTime();
        if (Date.now() > expMs) {
            throw new functions.https.HttpsError("deadline-exceeded", "Caregiver code has expired. Ask patient to generate a new code.");
        }
    }

    const caregiverUserDoc = await db.collection("users").doc(caregiverId).get();
    const caregiverData = caregiverUserDoc.data() || {};

    await db.collection("users").doc(patientId).collection("caregiverRequests").doc(caregiverId).set({
        caregiverId,
        caregiverName: caregiverData.name || caregiverData.email || "Caregiver",
        caregiverEmail: caregiverData.email || "",
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: "Link request sent to patient. Awaiting patient approval." };
});

exports.approveCaregiverRequest = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const patientId = context.auth.uid;
    const { caregiverId, caregiverName } = data;

    if (!caregiverId || typeof caregiverId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Caregiver ID required.");
    }

    const patientDoc = await db.collection("users").doc(patientId).get();
    const patientName = patientDoc.exists ? (patientDoc.data().name || "Patient") : "Patient";

    // Batch update using Admin SDK
    const batch = db.batch();
    batch.update(db.collection("users").doc(patientId).collection("caregiverRequests").doc(caregiverId), { status: "approved" });
    batch.set(db.collection("users").doc(patientId).collection("authorizedCaregivers").doc(caregiverId), {
        caregiverId,
        caregiverName: caregiverName || "Caregiver",
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection("users").doc(caregiverId).collection("linkedPatients").doc(patientId), {
        patientId,
        patientName,
        status: "approved",
        linkedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    return { success: true };
});

exports.revokeCaregiverAccess = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const patientId = context.auth.uid;
    const { caregiverId } = data;

    if (!caregiverId || typeof caregiverId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Caregiver ID required.");
    }

    const batch = db.batch();
    batch.delete(db.collection("users").doc(patientId).collection("authorizedCaregivers").doc(caregiverId));
    batch.delete(db.collection("users").doc(caregiverId).collection("linkedPatients").doc(patientId));
    await batch.commit();

    return { success: true };
});

// -------------------------------------------------------------
// 4. ACCOUNT & DATA DELETION
// -------------------------------------------------------------
exports.deleteUserAccountAndData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = context.auth.uid;
    const subcollections = [
        "medicines", "appointments", "history", "familyMembers", "doctors",
        "prescriptions", "emergencyContact", "caregiverAlerts", "caregiverRequests",
        "authorizedCaregivers", "linkedPatients", "aiChats", "devices", "rateLimits"
    ];

    for (const sub of subcollections) {
        const snap = await db.collection("users").doc(uid).collection(sub).get();
        for (const doc of snap.docs) {
            await doc.ref.delete();
        }
    }

    // Delete user profile document
    await db.collection("users").doc(uid).delete();

    // Delete auth account
    try {
        await admin.auth().deleteUser(uid);
    } catch (e) {
        // Silent Auth deletion fallback
    }

    return { success: true };
});

// -------------------------------------------------------------
// 5. TRANSACTIONAL & IDEMPOTENT REMINDER SCHEDULER
// -------------------------------------------------------------
exports.checkScheduledReminders = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
    let hasMore = true;
    const messaging = admin.messaging();

    while (hasMore) {
        const nowTimestamp = admin.firestore.Timestamp.now();

        // Query due medicines with composite index nextDueAt <= now
        const dueMedsSnap = await db.collectionGroup("medicines")
            .where("enabled", "==", true)
            .where("nextDueAt", "<=", nowTimestamp)
            .limit(50)
            .get();

        if (dueMedsSnap.empty) {
            hasMore = false;
            break;
        }

        for (const medDoc of dueMedsSnap.docs) {
            const medRef = medDoc.ref;
            const userRef = medRef.parent.parent;
            if (!userRef) continue;
            const userId = userRef.id;

            let claimedMed = null;

            // Transactional claim to prevent duplicate notification in overlapping runs
            await db.runTransaction(async (transaction) => {
                const freshDoc = await transaction.get(medRef);
                if (!freshDoc.exists) return;

                const med = freshDoc.data();
                if (!med.enabled || !med.nextDueAt || med.nextDueAt.toMillis() > nowTimestamp.toMillis()) {
                    return; // Already claimed or disabled
                }

                let nextDueAt = null;
                let enabled = true;

                if (med.repeatDaily) {
                    let nextDate = med.nextDueAt.toDate();
                    const now = nowTimestamp.toDate();
                    // Loop until nextDate is strictly in the FUTURE (> now)
                    while (nextDate.getTime() <= now.getTime()) {
                        nextDate.setDate(nextDate.getDate() + 1);
                    }
                    nextDueAt = admin.firestore.Timestamp.fromDate(nextDate);
                } else {
                    enabled = false;
                    nextDueAt = null;
                }

                transaction.update(medRef, {
                    nextDueAt,
                    enabled,
                    lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                claimedMed = { id: medDoc.id, userId, ...med };
            });

            if (!claimedMed) continue; // Skip if transaction claim returned null

            // Dispatch notification after atomic transaction claim
            const devicesSnap = await userRef.collection("devices").get();
            const deviceTokens = [];

            devicesSnap.forEach(devDoc => {
                const dev = devDoc.data();
                if (dev.token) {
                    deviceTokens.push({ deviceId: devDoc.id, token: dev.token });
                }
            });

            if (deviceTokens.length > 0) {
                const rawTokens = deviceTokens.map(d => d.token);
                const response = await messaging.sendEachForMulticast({
                    tokens: rawTokens,
                    notification: {
                        title: "💊 Medicine Reminder",
                        body: `Time to take ${claimedMed.name} (${claimedMed.dosage || "1 dose"}).`
                    },
                    data: {
                        medicineId: claimedMed.id,
                        userId
                    }
                });

                response.responses.forEach((res, idx) => {
                    if (!res.success && res.error) {
                        const errCode = res.error.code;
                        if (
                            errCode === "messaging/invalid-registration-token" ||
                            errCode === "messaging/registration-token-not-registered"
                        ) {
                            cleanupInvalidToken(userId, deviceTokens[idx].deviceId);
                        }
                    }
                });
            }
        }
    }
});
