// ==========================================================================
// MediCare Web Application Script (ES Modules + Firebase)
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    getMessaging,
    getToken,
    onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

import {
    getFunctions,
    httpsCallable,
    connectFunctionsEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAjwRvLU0QITWM6XUdU6iCbqGCu71uI3WU",
    authDomain: "medicare-5011c.firebaseapp.com",
    projectId: "medicare-5011c",
    storageBucket: "medicare-5011c.firebasestorage.app",
    messagingSenderId: "417059900592",
    appId: "1:417059900592:web:7bad70ab56f29a9dc27f75"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Connect Functions Emulator on localhost
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    try {
        connectFunctionsEmulator(functions, "localhost", 5001);
        console.log("[FirebaseEmulators] Connected Firebase Functions to localhost:5001");
    } catch (emuErr) {
        console.warn("[FirebaseEmulators] Emulator connect notice:", emuErr);
    }
}

const storage = getStorage(app);


// Application State Variables
let currentUser = null;
let currentUserData = null;

let medicines = [];
let appointments = [];
let historyItems = [];
let familyMembers = [];
let caregiverAlerts = [];
let doctors = [];
let prescriptions = [];
let aiChats = [];

let unsubscribeMedicines = null;
let unsubscribeAppointments = null;
let unsubscribeHistory = null;
let unsubscribeFamilyMembers = null;
let unsubscribeCaregiverAlerts = null;
let unsubscribeDoctors = null;
let unsubscribeCaregiverViewAlerts = null;
let unsubscribeAIChats = null;

let viewedPatientId = null;
let viewedPatientName = null;
let sosSending = false;
let snoozeMap = {};
let expiryAlertMap = {};
let waterReminderInterval = null;
let currentAuthTab = "login";

// Chart.js Instances
let weeklyAdherenceChartInstance = null;
let missedDosesChartInstance = null;

// --------------------------------------------------------------------------
// Non-Blocking Toast Notification System (Replaces alert())
// --------------------------------------------------------------------------
window.showToast = function (message, type = "info", duration = 3500) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;padding:0;margin:0;width:auto;">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 200);
    }, duration);
};

// --------------------------------------------------------------------------
// Accessible Confirmation Modal (Replaces confirm())
// --------------------------------------------------------------------------
window.showConfirmModal = function (title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirmModal");
        const modalTitle = document.getElementById("modalTitle");
        const modalMsg = document.getElementById("modalMessage");
        const confirmBtn = document.getElementById("modalConfirmBtn");
        const cancelBtn = document.getElementById("modalCancelBtn");

        if (!modal) {
            resolve(window.confirm(message));
            return;
        }

        modalTitle.innerText = title;
        modalMsg.innerText = message;
        modal.classList.remove("hidden");

        const cleanup = () => {
            modal.classList.add("hidden");
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        confirmBtn.onclick = () => { cleanup(); resolve(true); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
    });
};

// --------------------------------------------------------------------------
// PWA & Firebase Cloud Messaging (FCM) Initialization
// --------------------------------------------------------------------------
let swRegistration = null;

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            swRegistration = await navigator.serviceWorker.register("sw.js");
            console.log("Service Worker registered:", swRegistration.scope);

            // Force check for updates on page load
            swRegistration.update();

            if (swRegistration.waiting) {
                showSWUpdateToast();
            }

            swRegistration.addEventListener("updatefound", () => {
                const newWorker = swRegistration.installing;
                if (newWorker) {
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            showSWUpdateToast();
                        }
                    });
                }
            });
        } catch (err) {
            console.warn("SW registration notice:", err);
        }
    });
}

function showSWUpdateToast() {
    showToast(
        `⚡ New version available! <button onclick="window.location.reload()" style="background:#fff; color:#111; border:none; padding:4px 10px; border-radius:4px; margin-left:8px; cursor:pointer; font-weight:bold;">Refresh</button>`,
        "info",
        10000
    );
}


function getDeviceId() {
    let id = localStorage.getItem("medicare_device_id");
    if (!id) {
        id = "dev_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
        localStorage.setItem("medicare_device_id", id);
    }
    return id;
}

async function initFCM(user) {
    try {
        const isHttps = window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        const pwaBanner = document.getElementById("pwaNoticeBanner");
        if (pwaBanner && (!isHttps || isIos)) {
            pwaBanner.classList.remove("hidden");
        }

        if (!("Notification" in window)) return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const messaging = getMessaging(app);
        const options = {
            vapidKey: "BEl62iUYgUivxIkv69yViEuiC2PEc0Rt2hN5P5qW4x-7lWp-2b7k2c6"
        };
        if (swRegistration) options.serviceWorkerRegistration = swRegistration;

        const token = await getToken(messaging, options).catch(e => console.warn("FCM Token notice:", e.message));

        if (token && user) {
            const deviceId = getDeviceId();
            await setDoc(doc(db, "users", user.uid, "devices", deviceId), {
                token,
                userAgent: navigator.userAgent,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

        onMessage(messaging, (payload) => {
            showToast(`🔔 ${payload.notification?.title || "Reminder"}: ${payload.notification?.body || ""}`, "info", 5000);
        });
    } catch (e) {
        console.warn("FCM Notice:", e.message);
    }
}

// --------------------------------------------------------------------------
// Authentication Flow & Tab Management
// --------------------------------------------------------------------------
window.switchAuthTab = function (tab) {
    currentAuthTab = tab;
    const loginTab = document.getElementById("tabLogin");
    const signupTab = document.getElementById("tabSignup");
    const nameGroup = document.getElementById("signupNameGroup");
    const submitBtnText = document.querySelector("#authSubmitBtn .btn-text");

    if (tab === "signup") {
        signupTab.classList.add("active");
        loginTab.classList.remove("active");
        nameGroup.classList.remove("hidden");
        if (submitBtnText) submitBtnText.innerText = "Create Account";
    } else {
        loginTab.classList.add("active");
        signupTab.classList.remove("active");
        nameGroup.classList.add("hidden");
        if (submitBtnText) submitBtnText.innerText = "Login";
    }
    document.getElementById("authMessage").innerText = "";
};

window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        btn.innerText = "🙈";
    } else {
        input.type = "password";
        btn.innerText = "👁️";
    }
};

window.handleAuthSubmit = async function (e) {
    e.preventDefault();
    if (currentAuthTab === "signup") {
        await handleSignup();
    } else {
        await handleLogin();
    }
};

async function handleSignup() {
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const msg = document.getElementById("authMessage");

    msg.innerText = "";
    if (!name || !email || !password) {
        msg.style.color = "var(--danger-color)";
        msg.innerText = "Please complete all fields.";
        return;
    }
    if (password.length < 6) {
        msg.style.color = "var(--danger-color)";
        msg.innerText = "Password must be at least 6 characters.";
        return;
    }

    setAuthLoading(true);
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await createUserDocument(userCredential.user, name);
        await sendEmailVerification(userCredential.user);
        await signOut(auth);

        msg.style.color = "var(--success-color)";
        msg.innerText = "Account created! Verification email sent. Please check your inbox.";
        showToast("Verification email sent! Please verify before login.", "success");
    } catch (error) {
        msg.style.color = "var(--danger-color)";
        msg.innerText = error.message;
    } finally {
        setAuthLoading(false);
    }
}

async function handleLogin() {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const msg = document.getElementById("authMessage");

    msg.innerText = "";
    if (!email || !password) {
        msg.style.color = "var(--danger-color)";
        msg.innerText = "Please enter email and password.";
        return;
    }

    setAuthLoading(true);
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await userCredential.user.reload();

        if (!userCredential.user.emailVerified) {
            await signOut(auth);
            msg.style.color = "var(--danger-color)";
            msg.innerText = "Please verify your email address before logging in.";
            showToast("Please verify your email first.", "warning");
            return;
        }

        showToast("Login successful! Welcome back.", "success");
    } catch (error) {
        msg.style.color = "var(--danger-color)";
        switch (error.code) {
            case "auth/user-not-found": msg.innerText = "No account found with this email."; break;
            case "auth/wrong-password": msg.innerText = "Incorrect password."; break;
            case "auth/invalid-credential": msg.innerText = "Invalid credentials. Double check email and password."; break;
            default: msg.innerText = error.message;
        }
    } finally {
        setAuthLoading(false);
    }
}

function setAuthLoading(isLoading) {
    const btn = document.getElementById("authSubmitBtn");
    const text = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".btn-spinner");

    btn.disabled = isLoading;
    if (isLoading) {
        text.classList.add("hidden");
        spinner.classList.remove("hidden");
    } else {
        text.classList.remove("hidden");
        spinner.classList.add("hidden");
    }
}

window.forgotPassword = async function () {
    const email = document.getElementById("authEmail").value.trim();
    if (!email) {
        showToast("Please enter your email address first.", "warning");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset link sent to your email.", "success");
    } catch (error) {
        showToast(error.message, "danger");
    }
};

window.logout = async function () {
    const confirmed = await showConfirmModal("Logout", "Are you sure you want to log out?");
    if (!confirmed) return;

    if (unsubscribeMedicines) unsubscribeMedicines();
    if (unsubscribeAppointments) unsubscribeAppointments();
    if (unsubscribeHistory) unsubscribeHistory();
    if (unsubscribeFamilyMembers) unsubscribeFamilyMembers();
    if (unsubscribeCaregiverAlerts) unsubscribeCaregiverAlerts();
    if (unsubscribeDoctors) unsubscribeDoctors();
    if (unsubscribeCaregiverViewAlerts) unsubscribeCaregiverViewAlerts();
    if (unsubscribeAIChats) unsubscribeAIChats();
    if (unsubscribeCaregiverRequests) unsubscribeCaregiverRequests();
    if (unsubscribeAuthorizedCaregivers) unsubscribeAuthorizedCaregivers();

    await signOut(auth);
    showToast("Logged out successfully.", "info");
};

// Create User Document helper
async function createUserDocument(user, nameValue) {
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                name: nameValue || user.email.split("@")[0],
                email: user.email,
                caregiverCode: generateCaregiverCode(),
                createdAt: serverTimestamp(),
                settings: { theme: "light", sound: true, voice: true }
            });
        }
    } catch (e) {
        console.error("Error creating user doc:", e);
    }
}

function generateCaregiverCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return "CG-" + code;
}

window.regenerateCaregiverCode = async function () {
    if (!currentUser) return;
    const confirmed = await showConfirmModal("Regenerate Code", "Generate a new caregiver code? (Valid for 24 hours). Existing linked caregivers will keep access.");
    if (!confirmed) return;

    try {
        const regenCall = httpsCallable(functions, "regenerateCaregiverCode");
        const res = await regenCall();
        const newCode = res.data?.caregiverCode;
        if (newCode) {
            currentUserData.caregiverCode = newCode;
            document.getElementById("caregiverCodeText").innerText = newCode;
            document.getElementById("myCaregiverCode").innerText = newCode;
            showToast("New secure caregiver code generated! (Valid 24h)", "success");
        }
    } catch (e) {
        showToast("Failed to regenerate code: " + e.message, "danger");
    }
};

// --------------------------------------------------------------------------
// Auth State Observer
// --------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await user.reload();

        if (!user.emailVerified) {
            await signOut(auth);
            return;
        }

        await createUserDocument(user, "");
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        currentUserData = userSnap.data() || {};

        document.getElementById("authPage").classList.add("hidden");
        document.getElementById("appPage").classList.remove("hidden");
        document.body.classList.remove("pre-auth");
        document.getElementById("appPage").removeAttribute("inert");
        document.getElementById("appPage").removeAttribute("aria-hidden");
        document.getElementById("authPage").setAttribute("inert", "");

        const greeting = `Welcome, ${currentUserData.name || "User"} 👋`;
        document.getElementById("welcomeText").innerText = greeting;
        document.getElementById("headerWelcomeText").innerText = greeting;
        document.getElementById("caregiverCodeText").innerText = currentUserData.caregiverCode || "---";
        document.getElementById("myCaregiverCode").innerText = currentUserData.caregiverCode || "---";

        loadTheme();
        initFCM(user);
        loadEmergencyContact();

        listenMedicines();
        listenAppointments();
        listenHistory();
        listenFamilyMembers();
        listenCaregiverAlerts();
        listenDoctors();
        listenAIChats();
        listenCaregiverRequests();
        listenAuthorizedCaregivers();
        loadLinkedPatients();
        loadPrescriptions();
    } else {
        currentUser = null;
        document.getElementById("authPage").classList.remove("hidden");
        document.getElementById("appPage").classList.add("hidden");
        document.body.classList.add("pre-auth");
        document.getElementById("appPage").setAttribute("inert", "");
        document.getElementById("authPage").removeAttribute("inert");
    }
});

// --------------------------------------------------------------------------
// Theme & Navigation Helpers
// --------------------------------------------------------------------------
window.toggleTheme = async function () {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    const theme = isDark ? "dark" : "light";
    document.getElementById("themeIcon").innerText = isDark ? "☀️" : "🌙";
    localStorage.setItem("medicare_theme", theme);

    if (currentUser) {
        await updateDoc(doc(db, "users", currentUser.uid), { "settings.theme": theme });
    }
};

function loadTheme() {
    const savedTheme = localStorage.getItem("medicare_theme") || currentUserData?.settings?.theme;
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        document.getElementById("themeIcon").innerText = "☀️";
    } else {
        document.body.classList.remove("dark-mode");
        document.getElementById("themeIcon").innerText = "🌙";
    }
}

window.showPage = function (pageId) {
    try {
        document.querySelectorAll(".page-section").forEach(p => p.classList.add("hidden"));
        document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));

        const activePage = document.getElementById(pageId);
        if (activePage) {
            activePage.classList.remove("hidden");
        } else {
            throw new Error(`Page section #${pageId} not found.`);
        }

        const activeNav = document.getElementById(`nav-${pageId}`);
        if (activeNav) activeNav.classList.add("active");

        if (pageId === "dashboardPage") {
            updateDashboardStats();
        } else if (pageId === "analyticsPage") {
            updateAnalyticsCharts();
        } else if (pageId === "historyPage") {
            const badge = document.getElementById("notificationBadge");
            if (badge) {
                badge.innerText = "0";
                badge.classList.add("hidden");
            }
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        console.error("Navigation error:", err);
        showToast("Navigation error: " + err.message, "danger");
    }
};

// --------------------------------------------------------------------------
// MEDICINES LOGIC
// --------------------------------------------------------------------------
window.addTimeField = function () {
    const container = document.getElementById("timeInputs");
    const input = document.createElement("input");
    input.type = "time";
    input.className = "medicineTime";
    input.required = true;
    container.appendChild(input);
};

window.saveMedicine = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const editId = document.getElementById("editMedicineId").value;
    const name = document.getElementById("medicineName").value.trim();
    const dosage = document.getElementById("medicineDosage").value.trim();
    
    // Bug 4: Require dosage, do not default to "1" or "1 dose"
    if (!dosage) {
        showToast("Dosage is required (e.g. 500 mg, 1 tablet).", "warning");
        const dInput = document.getElementById("medicineDosage");
        if (dInput) {
            dInput.classList.add("input-highlight-error");
            dInput.focus();
        }
        return;
    }

    const category = document.getElementById("medicineCategory").value;
    const foodTiming = document.getElementById("medicineFoodTiming").value;
    const stock = Number(document.getElementById("medicineStock").value);
    const expiryDate = document.getElementById("medicineExpiry").value;
    const repeatDaily = document.getElementById("repeatDaily").checked;
    const notes = document.getElementById("medicineNotes").value.trim();
    const familySelect = document.getElementById("medicineFamilyMember");

    let familyMemberId = familySelect ? familySelect.value : "";
    let familyMemberName = familySelect && familySelect.selectedIndex >= 0 ? familySelect.options[familySelect.selectedIndex].text : "Self";

    const timeInputs = document.querySelectorAll(".medicineTime");
    let times = [];
    timeInputs.forEach(input => {
        if (input.value) {
            times.push({ time: input.value, taken: false, missed: false, notified: false });
        }
    });

    if (times.length === 0) {
        showToast("Please add at least one time for the medicine.", "warning");
        return;
    }

    // Bug 4: Duplicate detection (same name, dose, time, and member) with confirmation
    const lowerName = name.toLowerCase();
    const primaryTime = times[0]?.time;
    const isDuplicate = medicines.some(m => {
        if (editId && m.id === editId) return false;
        const sameName = m.name.toLowerCase() === lowerName;
        const sameMember = (m.familyMemberId || "") === familyMemberId;
        const sameDose = (m.dosage || "").toLowerCase() === dosage.toLowerCase();
        const sameTime = m.times && m.times.some(t => t.time === primaryTime);
        return sameName && sameMember && sameDose && sameTime;
    });

    if (isDuplicate) {
        const allowDup = await showConfirmModal(
            "Duplicate Medicine Detected",
            `A medicine "${name}" (${dosage}) at ${primaryTime} already exists for ${familyMemberName}.\n\nDo you want to save another copy anyway?`
        );
        if (!allowDup) {
            showToast("Cancelled saving duplicate medicine.", "info");
            return;
        }
    }

    // Bug 4: A medicine newly saved with a time earlier than now (like 08:00 today)
    // must NOT instantly appear as Missed. Schedule it for the next occurrence (tomorrow).
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    let hasPastTimeToday = false;

    if (!editId) {
        times = times.map(t => {
            const [h, m] = t.time.split(":").map(Number);
            const doseMins = h * 60 + m;
            if (doseMins <= currentMins) {
                hasPastTimeToday = true;
                return { ...t, scheduledForTomorrow: true, taken: false, missed: false, notified: false };
            }
            return t;
        });
    }

    // Compute nextDueAt Date object (Firestore Timestamp) from first dose time
    let nextDueAt = null;
    if (times.length > 0) {
        const [h, m] = times[0].time.split(":").map(Number);
        const doseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
        if (doseDate.getTime() <= now.getTime()) {
            doseDate.setDate(doseDate.getDate() + 1); // Next day if past
        }
        nextDueAt = doseDate;
    }

    const medicineData = {
        name, dosage, category, foodTiming, stock: stock || 0, expiryDate, repeatDaily, times, notes, familyMemberId, familyMemberName, nextDueAt, enabled: true
    };

    const submitBtn = document.querySelector("#medicinePage form button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (editId) {
            await updateDoc(doc(db, "users", currentUser.uid, "medicines", editId), medicineData);
            showToast("Medicine updated successfully! ✅", "success");
        } else {
            await addDoc(collection(db, "users", currentUser.uid, "medicines"), {
                ...medicineData, createdAt: serverTimestamp()
            });
            if (hasPastTimeToday) {
                showToast(`Medicine saved! Scheduled for tomorrow (next occurrence) since today's time has already passed. ⏰`, "success", 6000);
            } else {
                showToast("Medicine saved successfully! ✅", "success");
            }
        }
        resetMedicineForm();
    } catch (err) {
        showToast("Error saving medicine: " + err.message, "danger");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
};

window.resetMedicineForm = function () {
    document.getElementById("editMedicineId").value = "";
    document.getElementById("medicineName").value = "";
    document.getElementById("medicineDosage").value = "";
    document.getElementById("medicineCategory").value = "";
    document.getElementById("medicineStock").value = "";
    document.getElementById("medicineExpiry").value = "";
    document.getElementById("medicineNotes").value = "";
    document.getElementById("repeatDaily").checked = true;
    document.getElementById("cancelEditMedBtn").classList.add("hidden");
    document.getElementById("timeInputs").innerHTML = `<input type="time" class="medicineTime" required>`;
};

function listenMedicines() {
    const q = query(collection(db, "users", currentUser.uid, "medicines"), orderBy("createdAt", "desc"));
    unsubscribeMedicines = onSnapshot(q, snapshot => {
        medicines = [];
        snapshot.forEach(docSnap => medicines.push({ id: docSnap.id, ...docSnap.data() }));
        displayMedicines();
        updateDashboardStats();
        updateAnalyticsCharts();
    });
}

function displayMedicines() {
    const list = document.getElementById("medicineList");
    const searchBox = document.getElementById("searchMedicine");
    const memberFilter = document.getElementById("medicineFilterMember")?.value || "";
    const searchValue = searchBox ? searchBox.value.toLowerCase() : "";

    if (!list) return;

    const filtered = medicines.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(searchValue) || m.category.toLowerCase().includes(searchValue);
        const matchesMember = memberFilter === "" || m.familyMemberId === memberFilter;
        return matchesSearch && matchesMember;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💊</div>
                <p class="empty-text">No medicines found.</p>
                <button class="primary-btn" style="width:auto;" onclick="showPage('medicinePage')">+ Add First Medicine</button>
            </div>
        `;
        return;
    }

    list.innerHTML = "";
    filtered.forEach(m => {
        let dosesHtml = "";
        m.times.forEach((dose, index) => {
            let statusBadge = `<span class="badge">Pending</span>`;
            let takenDisabled = "";
            let snoozeDisabled = "";

            if (dose.taken) {
                statusBadge = `<span class="badge badge-success">Taken ✅</span>`;
                takenDisabled = "disabled";
                snoozeDisabled = "disabled";
            } else if (dose.scheduledForTomorrow) {
                statusBadge = `<span class="badge" style="background:#e0e7ff;color:#4338ca;">Next: Tomorrow ⏰</span>`;
            } else if (dose.missed || isMissed(dose.time, dose)) {
                statusBadge = `<span class="badge badge-danger">Missed ❌</span>`;
            }

            dosesHtml += `
                <div class="dose-row">
                    <span>⏰ ${formatTime(dose.time)} - ${statusBadge}</span>
                    <div class="dose-actions">
                        <button class="taken-btn" onclick="markTaken('${m.id}', ${index})" ${takenDisabled}>Mark Taken</button>
                        <button class="secondary-btn" onclick="skipDose('${m.id}', ${index})" ${takenDisabled}>Skip</button>
                        <button class="snooze-btn" onclick="snoozeMedicine('${m.id}', ${index})" ${snoozeDisabled}>Snooze</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML += `
            <div class="medicine-card">
                <div class="medicine-header">
                    <div>
                        <h3>${m.name} ${m.dosage ? `<small style="font-size:14px;color:var(--text-secondary);">(${m.dosage})</small>` : ""}</h3>
                        <span class="badge">${m.category}</span>
                        <span class="badge">Food: ${m.foodTiming || "After Food"}</span>
                        <span class="badge ${m.stock <= 3 ? "badge-danger" : ""}">Stock: ${m.stock}</span>
                        <span class="badge">For: ${m.familyMemberName || "Self"}</span>
                    </div>
                    <div>
                        <button class="secondary-btn" style="width:auto;padding:6px 12px;font-size:13px;" onclick="editMedicine('${m.id}')">Edit</button>
                        <button class="secondary-btn" style="width:auto;padding:6px 12px;font-size:13px;" onclick="refillStock('${m.id}')">Refill</button>
                        <button class="delete-btn" style="width:auto;padding:6px 12px;font-size:13px;" onclick="deleteMedicine('${m.id}')">Delete</button>
                    </div>
                </div>
                ${m.notes ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">📝 Notes: ${m.notes}</p>` : ""}
                ${dosesHtml}
            </div>
        `;
    });
}

window.editMedicine = function (id) {
    const med = medicines.find(m => m.id === id);
    if (!med) return;

    document.getElementById("editMedicineId").value = med.id;
    document.getElementById("medicineName").value = med.name;
    document.getElementById("medicineDosage").value = med.dosage || "";
    document.getElementById("medicineCategory").value = med.category;
    document.getElementById("medicineFoodTiming").value = med.foodTiming || "After Food";
    document.getElementById("medicineStock").value = med.stock;
    document.getElementById("medicineExpiry").value = med.expiryDate || "";
    document.getElementById("repeatDaily").checked = med.repeatDaily;
    document.getElementById("medicineNotes").value = med.notes || "";
    document.getElementById("cancelEditMedBtn").classList.remove("hidden");

    const timeInputs = document.getElementById("timeInputs");
    timeInputs.innerHTML = "";
    med.times.forEach(t => {
        const input = document.createElement("input");
        input.type = "time";
        input.className = "medicineTime";
        input.value = t.time;
        input.required = true;
        timeInputs.appendChild(input);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
};

window.markTaken = async function (medId, index) {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;
    if (med.stock <= 0) {
        showToast(`⚠ ${med.name} is out of stock! Please refill.`, "warning");
        return;
    }

    med.times[index].taken = true;
    med.times[index].missed = false;
    med.stock--;

    await updateDoc(doc(db, "users", currentUser.uid, "medicines", medId), { times: med.times, stock: med.stock });
    await addDoc(collection(db, "users", currentUser.uid, "history"), {
        medicineName: med.name, time: med.times[index].time, status: "Taken ✅", createdAt: serverTimestamp()
    });

    clearSpeechRepeatTimer();
    speakConfirmation("Medicine marked as taken.");
    showToast(`Marked ${med.name} as taken!`, "success");
};

window.skipDose = async function (medId, index) {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;

    med.times[index].taken = false;
    med.times[index].missed = true;

    await updateDoc(doc(db, "users", currentUser.uid, "medicines", medId), { times: med.times });
    await addDoc(collection(db, "users", currentUser.uid, "history"), {
        medicineName: med.name, time: med.times[index].time, status: "Skipped ⚠️", createdAt: serverTimestamp()
    });

    clearSpeechRepeatTimer();
    showToast(`Skipped dose for ${med.name}`, "info");
};

window.snoozeMedicine = async function (medId, index) {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;

    const snoozeTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
        await updateDoc(doc(db, "users", currentUser.uid, "medicines", medId), {
            nextDueAt: snoozeTime
        });
        clearSpeechRepeatTimer();
        speakConfirmation("Reminder snoozed for 10 minutes.");
        showToast(`Medicine snoozed for 10 minutes ⏰ (Server nextDueAt updated)`, "info");
    } catch (e) {
        showToast("Failed to snooze medicine: " + e.message, "danger");
    }
};


window.refillStock = async function (medId) {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;
    const newStockStr = prompt(`Refill stock count for ${med.name}:`, med.stock + 10);
    if (newStockStr === null) return;
    const newStock = Number(newStockStr);
    if (isNaN(newStock) || newStock < 0) return;

    await updateDoc(doc(db, "users", currentUser.uid, "medicines", medId), { stock: newStock });
    showToast(`Stock updated for ${med.name}!`, "success");
};

window.deleteMedicine = async function (medId) {
    const confirmed = await showConfirmModal("Delete Medicine", "Are you sure you want to delete this medicine record?");
    if (!confirmed) return;

    await deleteDoc(doc(db, "users", currentUser.uid, "medicines", medId));
    showToast("Medicine deleted.", "info");
};

// --------------------------------------------------------------------------
// FAMILY MEMBERS LOGIC
// --------------------------------------------------------------------------
window.addFamilyMember = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const name = document.getElementById("familyMemberName").value.trim();
    const relation = document.getElementById("familyMemberRelation").value;

    if (!name || !relation) {
        showToast("Please enter name and select relation.", "warning");
        return;
    }

    try {
        await addDoc(collection(db, "users", currentUser.uid, "familyMembers"), {
            name, relation, createdAt: serverTimestamp()
        });
        document.getElementById("familyMemberName").value = "";
        document.getElementById("familyMemberRelation").value = "";
        showToast("Family member added! ✅", "success");
    } catch (err) {
        showToast(err.message, "danger");
    }
};

function listenFamilyMembers() {
    const q = query(collection(db, "users", currentUser.uid, "familyMembers"), orderBy("createdAt", "desc"));
    unsubscribeFamilyMembers = onSnapshot(q, snapshot => {
        familyMembers = [];
        snapshot.forEach(docSnap => familyMembers.push({ id: docSnap.id, ...docSnap.data() }));
        displayFamilyMembers();
        updateFamilyDropdowns();
    });
}

function displayFamilyMembers() {
    const list = document.getElementById("familyMemberList");
    const search = document.getElementById("familySearch")?.value.toLowerCase() || "";
    if (!list) return;

    const filtered = familyMembers.filter(m => m.name.toLowerCase().includes(search) || m.relation.toLowerCase().includes(search));
    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state"><p class="empty-text">No family members added yet.</p></div>`;
        return;
    }

    list.innerHTML = "";
    filtered.forEach(m => {
        list.innerHTML += `
            <div class="medicine-card" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3>👤 ${m.name}</h3>
                    <span class="badge">${m.relation}</span>
                </div>
                <button class="delete-btn" style="width:auto;padding:6px 14px;" onclick="deleteFamilyMember('${m.id}')">Delete</button>
            </div>
        `;
    });
}

function updateFamilyDropdowns() {
    const select = document.getElementById("medicineFamilyMember");
    const filterSelect = document.getElementById("medicineFilterMember");

    if (select) {
        select.innerHTML = `<option value="">👤 Self</option>`;
        familyMembers.forEach(m => select.innerHTML += `<option value="${m.id}">${m.name} (${m.relation})</option>`);
    }
    if (filterSelect) {
        filterSelect.innerHTML = `<option value="">All Members</option>`;
        familyMembers.forEach(m => filterSelect.innerHTML += `<option value="${m.id}">${m.name} (${m.relation})</option>`);
    }
    document.getElementById("familyCount").innerText = familyMembers.length;
}

window.deleteFamilyMember = async function (id) {
    const confirmed = await showConfirmModal("Delete Member", "Delete this family member?");
    if (!confirmed) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "familyMembers", id));
    showToast("Family member removed.", "info");
};

// --------------------------------------------------------------------------
// APPOINTMENTS & DOCTORS LOGIC
// --------------------------------------------------------------------------
window.addAppointment = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const doctor = document.getElementById("doctorName").value.trim();
    const hospital = document.getElementById("hospitalName").value.trim();
    const date = document.getElementById("appointmentDate").value;
    const time = document.getElementById("appointmentTime").value;
    const notes = document.getElementById("appointmentNotes").value.trim();

    try {
        await addDoc(collection(db, "users", currentUser.uid, "appointments"), {
            doctor, hospital, date, time, notes, notified: false, createdAt: serverTimestamp()
        });
        document.getElementById("doctorName").value = "";
        document.getElementById("hospitalName").value = "";
        document.getElementById("appointmentDate").value = "";
        document.getElementById("appointmentTime").value = "";
        document.getElementById("appointmentNotes").value = "";
        showToast("Doctor appointment scheduled! 📅", "success");
    } catch (err) {
        showToast(err.message, "danger");
    }
};

function listenAppointments() {
    const q = query(collection(db, "users", currentUser.uid, "appointments"), orderBy("createdAt", "desc"));
    unsubscribeAppointments = onSnapshot(q, snapshot => {
        appointments = [];
        snapshot.forEach(docSnap => appointments.push({ id: docSnap.id, ...docSnap.data() }));
        displayAppointments();
    });
}

function displayAppointments() {
    const list = document.getElementById("appointmentList");
    if (!list) return;

    if (appointments.length === 0) {
        list.innerHTML = `<div class="empty-state"><p class="empty-text">No upcoming doctor appointments.</p></div>`;
        return;
    }

    list.innerHTML = "";
    appointments.forEach(app => {
        list.innerHTML += `
            <div class="appointment-card">
                <h3>🩺 ${app.doctor}</h3>
                <p><b>Hospital:</b> ${app.hospital || "General Practice"}</p>
                <p><b>Date & Time:</b> ${app.date} at ${formatTime(app.time)}</p>
                ${app.notes ? `<p><b>Notes:</b> ${app.notes}</p>` : ""}
                <button class="delete-btn" style="width:auto;" onclick="deleteAppointment('${app.id}')">Cancel Appointment</button>
            </div>
        `;
    });
}

window.deleteAppointment = async function (id) {
    const confirmed = await showConfirmModal("Cancel Appointment", "Cancel this appointment?");
    if (!confirmed) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "appointments", id));
    showToast("Appointment cancelled.", "info");
};

window.addDoctor = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const name = document.getElementById("doctorManageName").value.trim();
    const specialization = document.getElementById("doctorSpecialization").value.trim();
    const contact = document.getElementById("doctorContact").value.trim();
    const hospital = document.getElementById("doctorHospital").value.trim();

    try {
        await addDoc(collection(db, "users", currentUser.uid, "doctors"), {
            name, specialization, contact, hospital, createdAt: serverTimestamp()
        });
        document.getElementById("doctorManageName").value = "";
        document.getElementById("doctorSpecialization").value = "";
        document.getElementById("doctorContact").value = "";
        document.getElementById("doctorHospital").value = "";
        showToast("Doctor saved to directory! 🏥", "success");
    } catch (err) {
        showToast(err.message, "danger");
    }
};

function listenDoctors() {
    const q = query(collection(db, "users", currentUser.uid, "doctors"), orderBy("createdAt", "desc"));
    unsubscribeDoctors = onSnapshot(q, snapshot => {
        doctors = [];
        snapshot.forEach(docSnap => doctors.push({ id: docSnap.id, ...docSnap.data() }));
        displayDoctors();
    });
}

function displayDoctors() {
    const list = document.getElementById("doctorList");
    const search = document.getElementById("doctorSearch")?.value.toLowerCase() || "";
    if (!list) return;

    const filtered = doctors.filter(d => d.name.toLowerCase().includes(search) || d.specialization.toLowerCase().includes(search));
    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state"><p class="empty-text">No doctors saved.</p></div>`;
        return;
    }

    list.innerHTML = "";
    filtered.forEach(d => {
        list.innerHTML += `
            <div class="doctor-card" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3>👨‍⚕ ${d.name}</h3>
                    <p><b>Specialization:</b> ${d.specialization}</p>
                    <p><b>Clinic:</b> ${d.hospital}</p>
                    <a href="tel:${d.contact}" class="badge badge-success" style="text-decoration:none;display:inline-block;margin-top:6px;">📞 Call ${d.contact}</a>
                </div>
                <button class="delete-btn" style="width:auto;" onclick="deleteDoctor('${d.id}')">Delete</button>
            </div>
        `;
    });
}

window.deleteDoctor = async function (id) {
    const confirmed = await showConfirmModal("Delete Doctor", "Remove this doctor from directory?");
    if (!confirmed) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "doctors", id));
    showToast("Doctor removed.", "info");
};

// --------------------------------------------------------------------------
// EMERGENCY SOS & CAREGIVER SYSTEM
// --------------------------------------------------------------------------
window.saveEmergencyContact = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const name = document.getElementById("emergencyName").value.trim();
    const phone = document.getElementById("emergencyPhone").value.trim();

    try {
        await setDoc(doc(db, "users", currentUser.uid, "emergencyContact", "info"), {
            emergencyName: name, emergencyPhone: phone, updatedAt: serverTimestamp()
        });
        showToast("Emergency contact saved!", "success");
        loadEmergencyContact();
    } catch (err) {
        showToast(err.message, "danger");
    }
};

async function loadEmergencyContact() {
    const box = document.getElementById("emergencyContactBox");
    if (!box || !currentUser) return;
    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid, "emergencyContact", "info"));
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById("emergencyName").value = data.emergencyName || "";
            document.getElementById("emergencyPhone").value = data.emergencyPhone || "";
            box.innerHTML = `
                <div class="medicine-card">
                    <h3>🚨 Private Emergency Contact</h3>
                    <p><b>Name:</b> ${data.emergencyName}</p>
                    <p><b>Phone:</b> ${data.emergencyPhone}</p>
                    <a href="tel:${data.emergencyPhone}" class="secondary-btn" style="display:inline-block;margin-top:10px;text-decoration:none;width:auto;">📞 Call Contact Now</a>
                </div>
            `;
        }
    } catch (e) { console.error("Load emergency contact error:", e); }
}

window.triggerSOS = async function () {
    if (!currentUser || sosSending) return;
    const confirmed = await showConfirmModal("🚨 SEND EMERGENCY SOS", "Are you sure you want to trigger an Emergency SOS Alert to your caregivers?");
    if (!confirmed) return;

    sosSending = true;
    const sosBtn = document.getElementById("sosButton");
    const statusBox = document.getElementById("sosStatus");

    sosBtn.disabled = true;
    sosBtn.innerText = "Sending SOS Broadcast...";
    statusBox.innerHTML = `<div class="toast toast-warning">Broadcasting SOS Alert to backend & caregivers...</div>`;

    try {
        const sendSOSAlertCall = httpsCallable(functions, "sendSOSAlert");
        const res = await sendSOSAlertCall({
            patientName: currentUserData?.name || "Patient",
            emergencyContactPhone: document.getElementById("emergencyPhone")?.value || ""
        });

        statusBox.innerHTML = `
            <div class="alert-card sos-alert sos-active">
                <h3>🚨 SOS BROADCAST SUCCESSFUL</h3>
                <p>Authorized Caregivers Notified: <b>${res.data?.caregiversNotified || 0}</b></p>
                <p>SMS Status: <b>${res.data?.smsStatus || "disabled"}</b></p>
            </div>
        `;
        showToast("🚨 Emergency SOS Alert Triggered!", "danger", 6000);
    } catch (err) {
        // Fallback local Firestore write if Functions backend is offline
        await addDoc(collection(db, "users", currentUser.uid, "caregiverAlerts"), {
            patientId: currentUser.uid,
            patientName: currentUserData?.name || "Patient",
            type: "SOS",
            message: "Emergency SOS triggered",
            status: "ACTIVE",
            createdAt: serverTimestamp()
        });
        statusBox.innerHTML = `
            <div class="alert-card sos-alert">
                <h3>🚨 SOS Alert Logged to Firestore</h3>
            </div>
        `;
        showToast("SOS Alert saved to Firestore feed.", "warning");
    } finally {
        setTimeout(() => {
            sosSending = false;
            sosBtn.disabled = false;
            sosBtn.innerText = "🚨 SEND EMERGENCY SOS ALERT";
        }, 5000);
    }
};

let unsubscribeCaregiverRequests = null;
let unsubscribeAuthorizedCaregivers = null;

window.requestPatientLink = async function () {
    const code = document.getElementById("caregiverSearchCode").value.trim().toUpperCase();
    if (!code) { showToast("Enter a valid patient caregiver code.", "warning"); return; }
    if (code === currentUserData?.caregiverCode) {
        showToast("You cannot link your own caregiver code.", "warning");
        return;
    }

    try {
        const requestCaregiverLinkCall = httpsCallable(functions, "requestCaregiverLink");
        const res = await requestCaregiverLinkCall({ caregiverCode: code });
        showToast(res.data?.message || "Link request sent to patient! Awaiting approval.", "success");
        document.getElementById("caregiverSearchCode").value = "";
    } catch (err) {
        showToast("Link request failed: " + err.message, "danger");
    }
};

function listenCaregiverRequests() {
    if (!currentUser) return;
    const q = query(collection(db, "users", currentUser.uid, "caregiverRequests"));
    unsubscribeCaregiverRequests = onSnapshot(q, snapshot => {
        const container = document.getElementById("caregiverRequestsList");
        if (!container) return;

        const pending = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status === "pending") pending.push({ id: docSnap.id, ...data });
        });

        if (pending.length === 0) {
            container.innerHTML = `<p class="empty-text">No pending caregiver link requests.</p>`;
            return;
        }

        container.innerHTML = "";
        pending.forEach(req => {
            container.innerHTML += `
                <div class="medicine-card" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3>👨‍⚕ Caregiver Request: ${req.caregiverName}</h3>
                        <p style="font-size:13px;color:var(--text-secondary);">${req.caregiverEmail}</p>
                    </div>
                    <div>
                        <button class="primary-btn" style="width:auto;padding:6px 14px;" onclick="approveCaregiverRequest('${req.caregiverId}', '${req.caregiverName}')">Approve ✅</button>
                        <button class="delete-btn" style="width:auto;padding:6px 14px;margin-left:6px;" onclick="rejectCaregiverRequest('${req.caregiverId}')">Reject ❌</button>
                    </div>
                </div>
            `;
        });
    });
}

window.approveCaregiverRequest = async function (caregiverId, caregiverName) {
    if (!currentUser) return;
    try {
        const approveCall = httpsCallable(functions, "approveCaregiverRequest");
        await approveCall({ caregiverId, caregiverName });
        showToast(`Approved ${caregiverName} as authorized caregiver!`, "success");
    } catch (err) {
        showToast("Error approving request: " + err.message, "danger");
    }
};

window.rejectCaregiverRequest = async function (caregiverId) {
    if (!currentUser) return;
    try {
        await deleteDoc(doc(db, "users", currentUser.uid, "caregiverRequests", caregiverId));
        showToast("Caregiver request rejected.", "info");
    } catch (err) {
        showToast("Error rejecting request: " + err.message, "danger");
    }
};

function listenAuthorizedCaregivers() {
    if (!currentUser) return;
    const q = query(collection(db, "users", currentUser.uid, "authorizedCaregivers"));
    unsubscribeAuthorizedCaregivers = onSnapshot(q, snapshot => {
        const container = document.getElementById("authorizedCaregiversList");
        if (!container) return;

        if (snapshot.empty) {
            container.innerHTML = `<p class="empty-text">No authorized caregivers yet.</p>`;
            return;
        }

        container.innerHTML = "";
        snapshot.forEach(docSnap => {
            const cg = docSnap.data();
            container.innerHTML += `
                <div class="medicine-card" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3>👨‍⚕ ${cg.caregiverName || "Authorized Caregiver"}</h3>
                        <span class="badge badge-success">Approved ✅</span>
                    </div>
                    <button class="delete-btn" style="width:auto;padding:6px 14px;" onclick="revokeCaregiverAccess('${cg.caregiverId}')">Revoke Access</button>
                </div>
            `;
        });
    });
}

window.revokeCaregiverAccess = async function (caregiverId) {
    const confirmed = await showConfirmModal("Revoke Access", "Revoke caregiver access for this user?");
    if (!confirmed) return;
    try {
        const revokeCall = httpsCallable(functions, "revokeCaregiverAccess");
        await revokeCall({ caregiverId });
        showToast("Caregiver access revoked.", "info");
    } catch (e) { showToast(e.message, "danger"); }
};

window.confirmDeleteAccount = async function () {
    const confirmed = await showConfirmModal("PERMANENT ACCOUNT DELETION", "Are you sure you want to PERMANENTLY delete your account and all data? This action CANNOT be undone!");
    if (!confirmed) return;

    showToast("Deleting all user data and account...", "warning", 5000);
    try {
        const deleteCall = httpsCallable(functions, "deleteUserAccountAndData");
        await deleteCall();
        await signOut(auth);
        showToast("Account and all associated data deleted permanently.", "info", 5000);
    } catch (e) {
        showToast("Account deletion failed: " + e.message, "danger");
    }
};

async function loadLinkedPatients() {
    const list = document.getElementById("linkedPatientsList");
    if (!list || !currentUser) return;
    try {
        const snap = await getDocs(collection(db, "users", currentUser.uid, "linkedPatients"));
        if (snap.empty) {
            list.innerHTML = `<p class="empty-text">No linked patients yet.</p>`;
            return;
        }
        list.innerHTML = "";
        snap.forEach(docSnap => {
            const p = docSnap.data();
            list.innerHTML += `<button class="secondary-btn" style="width:auto;margin:4px;" onclick="viewPatient('${p.patientId}', '${p.patientName}')">👤 View ${p.patientName}</button>`;
        });
    } catch (e) { console.error("Load linked patients error:", e); }
}

window.viewPatient = async function (patientId, name) {
    const container = document.getElementById("caregiverData");
    container.innerHTML = `<div class="skeleton-card"></div>`;
    try {
        const medsSnap = await getDocs(collection(db, "users", patientId, "medicines"));
        let html = `<h3>Patient Profile: ${name}</h3>`;
        medsSnap.forEach(d => {
            const m = d.data();
            html += `<div class="medicine-card"><h3>${m.name}</h3><p>Category: ${m.category} | Stock: ${m.stock}</p></div>`;
        });
        container.innerHTML = html;
    } catch (e) { container.innerHTML = `<p class="empty-text">Could not fetch patient details.</p>`; }
};

function listenCaregiverAlerts() {
    const q = query(collection(db, "users", currentUser.uid, "caregiverAlerts"), orderBy("createdAt", "desc"));
    unsubscribeCaregiverAlerts = onSnapshot(q, snapshot => {
        caregiverAlerts = [];
        snapshot.forEach(docSnap => caregiverAlerts.push({ id: docSnap.id, ...docSnap.data() }));
        displayCaregiverAlerts();
    });
}

function displayCaregiverAlerts() {
    const list = document.getElementById("caregiverAlertList");
    if (!list) return;
    if (caregiverAlerts.length === 0) {
        list.innerHTML = `<p class="empty-text">No active alerts.</p>`;
        return;
    }
    list.innerHTML = "";
    caregiverAlerts.forEach(a => {
        list.innerHTML += `
            <div class="alert-card ${a.type === 'SOS' ? 'sos-alert' : ''}">
                <h3>${a.type === 'SOS' ? '🚨 EMERGENCY SOS' : '⚠️ Missed Dose Alert'}</h3>
                <p>${a.message}</p>
                <small>${a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : 'Just now'}</small>
            </div>
        `;
    });
}

// --------------------------------------------------------------------------
// AI HEALTH ASSISTANT LOGIC (Backend Cloud Function Proxy)
// --------------------------------------------------------------------------
function listenAIChats() {
    if (!currentUser) return;
    const q = query(collection(db, "users", currentUser.uid, "aiChats"), orderBy("createdAt", "asc"));
    unsubscribeAIChats = onSnapshot(q, snapshot => {
        aiChats = [];
        snapshot.forEach(docSnap => aiChats.push({ id: docSnap.id, ...docSnap.data() }));
        renderAIChats();
    });
}

function renderAIChats() {
    const historyBox = document.getElementById("chatHistory");
    if (!historyBox) return;

    if (aiChats.length === 0) {
        historyBox.innerHTML = `
            <div class="chat-bubble assistant-bubble">
                👋 Hello! I am your MediCare AI Health Assistant. Ask me about your medicine schedules, general health guidance, or wellness tips!
            </div>
        `;
        return;
    }

    historyBox.innerHTML = "";
    aiChats.forEach(chat => {
        const userDiv = document.createElement("div");
        userDiv.className = "chat-bubble user-bubble";
        userDiv.innerText = chat.question;

        const aiDiv = document.createElement("div");
        aiDiv.className = "chat-bubble assistant-bubble";
        aiDiv.innerHTML = chat.answer.replace(/\n/g, "<br>");

        historyBox.appendChild(userDiv);
        historyBox.appendChild(aiDiv);
    });

    historyBox.scrollTop = historyBox.scrollHeight;
}

function handleFunctionError(err, contextName = "AI Assistant") {
    console.error(`[${contextName}] Call error:`, err);
    let msg = "An unexpected error occurred. Please try again.";
    const code = err?.code || "";
    const rawMsg = err?.message || "";

    if (code === "unauthenticated" || rawMsg.includes("Authentication required") || rawMsg.includes("log in")) {
        msg = "Please log in to use the AI Assistant.";
    } else if (code === "resource-exhausted" || rawMsg.includes("Rate limit")) {
        msg = "Rate limit reached. Please wait a moment before trying again.";
    } else if (code === "failed-precondition" || rawMsg.includes("unconfigured") || rawMsg.includes("GEMINI_API_KEY missing")) {
        msg = "AI Assistant service is currently unconfigured (GEMINI_API_KEY missing).";
    } else if (code === "unavailable" || rawMsg.includes("unavailable") || rawMsg.includes("Failed to reach")) {
        msg = "Gemini service is currently unavailable. Please try again later.";
    } else if (code === "permission-denied") {
        msg = "API Key or permission error when communicating with Gemini AI.";
    } else if (code === "invalid-argument") {
        msg = rawMsg || "Invalid request parameter.";
    } else if (rawMsg) {
        msg = rawMsg;
    }

    showToast(`${contextName} error: ${msg}`, "danger");
    return msg;
}

window.saveGeminiKey = async function() {
    const key = document.getElementById("userGeminiApiKey").value.trim();
    if (key) {
        localStorage.setItem("medicare_gemini_key", key);
        showToast("Gemini API Key saved. Testing key...", "info");
        await window.testGeminiKey();
    } else {
        showToast("Please enter a valid API key.", "warning");
    }
};

window.removeGeminiKey = function() {
    localStorage.removeItem("medicare_gemini_key");
    localStorage.removeItem("medicare_gemini_model");
    localStorage.removeItem("medicare_gemini_model_time");
    const input = document.getElementById("userGeminiApiKey");
    if (input) input.value = "";
    const statusEl = document.getElementById("geminiKeyStatusText");
    if (statusEl) {
        statusEl.innerText = "Status: No key saved.";
        statusEl.style.color = "var(--text-secondary)";
    }
    const modelText = document.getElementById("geminiActiveModelText");
    if (modelText) modelText.innerText = "Active Model: ---";
    const sel = document.getElementById("geminiModelOverride");
    if (sel) sel.innerHTML = '<option value="auto">Auto (Recommended)</option>';
    showToast("Gemini API Key removed.", "info");
};

// Dynamic Model Selection & Unified API Call
window.getAvailableGeminiModels = async function(apiKey) {
    let models = [];
    let pageToken = "";
    try {
        do {
            let url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`;
            if (pageToken) url += `&pageToken=${pageToken}`;
            
            const res = await fetch(url, {
                method: "GET",
                headers: { "x-goog-api-key": apiKey }
            });
            
            if (!res.ok) {
                if (res.status === 400 || res.status === 403) throw new Error("Invalid API key or API disabled.");
                if (res.status === 429) throw new Error("Rate limit exceeded. Please wait a minute.");
                throw new Error("Failed to fetch models.");
            }
            const data = await res.json();
            if (data.models) {
                models = models.concat(data.models);
            }
            pageToken = data.nextPageToken || "";
        } while (pageToken);
        
        return models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
    } catch (e) {
        throw e;
    }
};

window.pickBestGeminiModel = function(models) {
    let getVer = (name) => {
        let match = name.match(/gemini-(\d+\.\d+)/);
        return match ? parseFloat(match[1]) : 0;
    };

    let flashStable = [];
    let flashLite = [];
    let others = [];

    for (let m of models) {
        let n = m.name.toLowerCase();
        if (n.includes("-preview") || n.includes("-image") || n.includes("-tts") || n.includes("-live") || n.includes("-embedding") || n.includes("-vision")) {
            others.push(m);
            continue;
        }
        if (n.includes("-flash-lite")) {
            flashLite.push(m);
        } else if (n.includes("-flash")) {
            flashStable.push(m);
        } else {
            others.push(m);
        }
    }

    let sortFn = (a, b) => getVer(b.name) - getVer(a.name);
    flashStable.sort(sortFn);
    flashLite.sort(sortFn);
    others.sort(sortFn);

    if (flashStable.length > 0) return flashStable[0].name;
    if (flashLite.length > 0) return flashLite[0].name;
    if (others.length > 0) return others[0].name;
    
    return (models && models.length > 0) ? models[0].name : ""; 
};

window.getActiveModel = async function(apiKey = null, forceRefresh = false, excludeModel = null) {
    const key = apiKey || localStorage.getItem("medicare_gemini_key");
    const override = document.getElementById("geminiModelOverride")?.value;
    if (!forceRefresh && override && override !== "auto" && override !== excludeModel) {
        const txt = document.getElementById("geminiActiveModelText");
        if (txt) txt.innerText = `Active Model: ${override.replace('models/', '')} (Manual)`;
        return override;
    }

    let cached = localStorage.getItem("medicare_gemini_model");
    let cachedTime = localStorage.getItem("medicare_gemini_model_time");
    let now = Date.now();
    let shouldFetch = forceRefresh || !cached || (excludeModel && (cached === excludeModel || cached.endsWith(excludeModel))) || !cachedTime || (now - parseInt(cachedTime) > 24 * 60 * 60 * 1000);

    if (shouldFetch && key) {
        let modelsList = await window.getAvailableGeminiModels(key);
        if (excludeModel) {
            modelsList = modelsList.filter(m => m.name !== excludeModel && !m.name.endsWith(excludeModel));
        }
        cached = window.pickBestGeminiModel(modelsList);
        if (cached) {
            localStorage.setItem("medicare_gemini_model", cached);
            localStorage.setItem("medicare_gemini_model_time", now.toString());
        }
    }

    if (cached && document.getElementById("geminiActiveModelText")) {
        document.getElementById("geminiActiveModelText").innerText = `Active Model: ${cached.replace('models/', '')}`;
    }

    return cached;
};
window.getGeminiModel = window.getActiveModel;

window.populateModelDropdown = async function(apiKey) {
    const sel = document.getElementById("geminiModelOverride");
    if (!sel) return;
    try {
        let models = await window.getAvailableGeminiModels(apiKey);
        sel.innerHTML = '<option value="auto">Auto (Recommended)</option>';
        models.forEach(m => {
            let opt = document.createElement("option");
            opt.value = m.name;
            opt.innerText = m.displayName || m.name.replace('models/', '');
            sel.appendChild(opt);
        });
    } catch (e) {
        console.warn("Could not populate models dropdown", e);
    }
};

window.callGemini = async function(prompt, options = {}) {
    const apiKey = options.apiKey || localStorage.getItem("medicare_gemini_key");
    if (!apiKey) {
        throw new Error("Add your Gemini key to enable AI.");
    }

    let modelName;
    try {
        modelName = await window.getActiveModel(apiKey, options.forceRefresh || false, options.excludeModel || null);
    } catch (e) {
        throw new Error("Failed to select AI model. Check your API key.");
    }

    if (!modelName) {
        throw new Error("No available Gemini model found for this key.");
    }

    let cleanModelName = modelName.startsWith("models/") ? modelName : `models/${modelName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${cleanModelName}:generateContent`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: options.generationConfig || { temperature: 0.4, maxOutputTokens: 700 }
    };
    if (options.systemInstruction) {
        payload.system_instruction = { parts: [{ text: options.systemInstruction }] };
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const status = response.status;
            // If 404, refresh model list once, switch to the next best model, retry once, and update the "Active Model" label in the UI
            if (status === 404 && options.retryOn404 !== false) {
                console.warn(`[callGemini] Model ${cleanModelName} returned 404. Refreshing model list and trying next best model...`);
                const nextModel = await window.getActiveModel(apiKey, true, cleanModelName);
                if (nextModel && nextModel !== cleanModelName) {
                    showToast(`Model ${cleanModelName.replace('models/', '')} not found. Switched to ${nextModel.replace('models/', '')}. Retrying...`, "info");
                    return window.callGemini(prompt, { ...options, retryOn404: false });
                }
            }
            if (status === 400 || status === 403) throw new Error("Invalid key or API disabled.");
            if (status === 404) throw new Error("Model not found. Retried and failed.");
            if (status === 429) throw new Error("Quota or rate limit exceeded. Please wait a minute.");
            if (status >= 500) throw new Error("Gemini network service down. Please try later.");
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error ${status}`);
        }

        const data = await response.json();
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            throw new Error("Prompt blocked by safety filters: " + data.promptFeedback.blockReason);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error("Empty response from AI.");
        }
        return text;
    } catch (err) {
        let safeMsg = err.message.replace(apiKey, "[HIDDEN_KEY]");
        throw new Error(safeMsg);
    }
};
window.callGeminiAPI = window.callGemini;

window.testGeminiKey = async function() {
    const inputKey = document.getElementById("userGeminiApiKey")?.value.trim();
    const key = inputKey || localStorage.getItem("medicare_gemini_key");
    if (!key) {
        showToast("No API key found to test.", "warning");
        return;
    }

    const statusEl = document.getElementById("geminiKeyStatusText");
    if (statusEl) {
        statusEl.innerText = "Status: Testing key & loading models... ⏳";
        statusEl.style.color = "var(--warning-color)";
    }

    try {
        const models = await window.getAvailableGeminiModels(key);
        if (!localStorage.getItem("medicare_gemini_key")) {
            localStorage.setItem("medicare_gemini_key", key);
        }

        const best = window.pickBestGeminiModel(models);
        localStorage.setItem("medicare_gemini_model", best);
        localStorage.setItem("medicare_gemini_model_time", Date.now().toString());

        await window.populateModelDropdown(key);

        // Verify key by calling Gemini via callGemini
        await window.callGemini("Respond with 'OK' if working.", { apiKey: key });

        if (statusEl) {
            statusEl.innerText = `Status: Key valid! Found ${models.length} usable models. ✅`;
            statusEl.style.color = "var(--success-color)";
        }
        const activeText = document.getElementById("geminiActiveModelText");
        if (activeText) {
            activeText.innerText = `Active Model: ${best.replace('models/', '')}`;
        }
        showToast(`API Key valid. Active model: ${best.replace('models/', '')}`, "success");
    } catch(e) {
        if (statusEl) {
            statusEl.innerText = "Status: Key test failed. ❌";
            statusEl.style.color = "var(--danger-color)";
        }
        let safeMsg = e.message.replace(key, "[HIDDEN_KEY]");
        showToast("API Key test failed: " + safeMsg, "danger");
    }
};

window.loadGeminiKeyUI = async function() {
    const key = localStorage.getItem("medicare_gemini_key");
    if (key) {
        const input = document.getElementById("userGeminiApiKey");
        if (input) input.value = key;
        const statusEl = document.getElementById("geminiKeyStatusText");
        if (statusEl) {
            statusEl.innerText = "Status: Key loaded from storage. ✅";
            statusEl.style.color = "var(--success-color)";
        }
        try {
            await window.getActiveModel(key, false);
            await window.populateModelDropdown(key);
        } catch (e) {
            console.warn("Could not auto-load model on startup", e);
        }
    }
};

window.addEventListener("load", () => {
    if (window.loadGeminiKeyUI) window.loadGeminiKeyUI();
});

window.askHealthAI = async function (e) {
    if (e) e.preventDefault();

    if (!currentUser) {
        showToast("Please log in to ask questions to the AI Assistant.", "warning");
        return;
    }

    const consentBox = document.getElementById("aiConsentCheckbox");
    if (consentBox && !consentBox.checked) {
        showToast("Please check the AI data processing consent box before submitting.", "warning");
        return;
    }

    const apiKey = localStorage.getItem("medicare_gemini_key");
    if (!apiKey) {
        showToast("Add your Gemini key to enable AI.", "warning");
        const geminiInput = document.getElementById("geminiKeyInput");
        if (geminiInput) geminiInput.focus();
        return;
    }

    const input = document.getElementById("aiQuestion");
    const question = input.value.trim();
    const submitBtn = document.getElementById("aiSubmitBtn");

    if (!question) return;

    // Safety emergency filter check
    const lower = question.toLowerCase();
    if (lower.includes("chest pain") || lower.includes("heart attack") || lower.includes("bleeding")) {
        showToast("🚨 Medical Emergency detected! Contact 911 / 108 immediately.", "danger", 7000);
    }

    input.value = "";
    submitBtn.disabled = true;

    try {
        const medSummary = medicines.map(m => `${m.name} (${m.dosage || '1 dose'})`).join(", ");
        const appSummary = appointments.map(a => `${a.doctor} on ${a.date}`).join(", ");
        const docSummary = doctors.map(d => d.name).join(", ");
        
        const systemInstruction = `You are a helpful AI Health Assistant for the MediCare app. The user's active medicines are: ${medSummary}. Their upcoming appointments are: ${appSummary}. Their saved doctors are: ${docSummary}. Answer their health queries politely and concisely. Do not provide critical medical diagnoses, advise them to see a doctor for serious issues.`;

        const answer = await window.callGemini(question, { systemInstruction });

        await addDoc(collection(db, "users", currentUser.uid, "aiChats"), {
            question, answer, createdAt: serverTimestamp()
        });
    } catch (err) {
        showToast("AI Assistant error: " + err.message, "danger");
    } finally {
        submitBtn.disabled = false;
    }
};


// --------------------------------------------------------------------------
// HEALTH TOOLS (BMI, Prescriptions, Water Reminder)
// --------------------------------------------------------------------------
window.calculateBMI = function (e) {
    if (e) e.preventDefault();
    const height = Number(document.getElementById("heightInput").value);
    const weight = Number(document.getElementById("weightInput").value);
    const container = document.getElementById("bmiResultContainer");

    if (height <= 0 || weight <= 0) return;
    const bmi = (weight / ((height / 100) * (height / 100))).toFixed(1);

    let category = "Normal weight";
    let badgeClass = "badge-success";
    if (bmi < 18.5) { category = "Underweight"; badgeClass = "badge-warning"; }
    else if (bmi >= 25 && bmi < 30) { category = "Overweight"; badgeClass = "badge-warning"; }
    else if (bmi >= 30) { category = "Obese"; badgeClass = "badge-danger"; }

    container.innerHTML = `
        <div class="stat-card">
            <h3>Your BMI Result</h3>
            <p>${bmi} <span class="badge ${badgeClass}">${category}</span></p>
        </div>
    `;
};

window.addPrescriptionRecord = async function (e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    const doctor = document.getElementById("prescriptionDoctor").value.trim();
    const medicine = document.getElementById("prescriptionMedicine").value.trim();
    const date = document.getElementById("prescriptionDate").value;
    const notes = document.getElementById("prescriptionNotes").value.trim();
    const fileInput = document.getElementById("prescriptionFile");

    let fileUrl = "";
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        try {
            const sRef = storageRef(storage, `prescriptions/${currentUser.uid}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(sRef, file);
            fileUrl = await getDownloadURL(snap.ref);
        } catch (stErr) {
            console.warn("Storage upload fallback to base64 reader:", stErr);
            fileUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            });
        }
    }

    try {
        await addDoc(collection(db, "users", currentUser.uid, "prescriptions"), {
            doctor, medicine, date, notes, fileUrl, createdAt: serverTimestamp()
        });
        showToast("Prescription record archived! 📄", "success");
        document.getElementById("prescriptionDoctor").value = "";
        document.getElementById("prescriptionMedicine").value = "";
        document.getElementById("prescriptionDate").value = "";
        document.getElementById("prescriptionNotes").value = "";
        document.getElementById("prescriptionFile").value = "";
        loadPrescriptions();
    } catch (err) { showToast(err.message, "danger"); }
};

async function loadPrescriptions() {
    const list = document.getElementById("prescriptionList");
    if (!list || !currentUser) return;
    try {
        const snap = await getDocs(query(collection(db, "users", currentUser.uid, "prescriptions"), orderBy("createdAt", "desc")));
        if (snap.empty) { list.innerHTML = `<p class="empty-text">No archived prescriptions.</p>`; return; }
        list.innerHTML = "";
        snap.forEach(d => {
            const p = d.data();
            list.innerHTML += `
                <div class="medicine-card">
                    <h3>📄 ${p.medicine}</h3>
                    <p><b>Doctor:</b> ${p.doctor} | <b>Date:</b> ${p.date}</p>
                    ${p.notes ? `<p><b>Notes:</b> ${p.notes}</p>` : ""}
                    ${p.fileUrl ? `<img src="${p.fileUrl}" style="max-width:100%;max-height:200px;margin-top:10px;border-radius:8px;">` : ""}
                </div>
            `;
        });
    } catch (e) { console.error(e); }
}

window.startWaterReminder = function () {
    const intervalMins = Number(document.getElementById("waterInterval").value) || 60;
    if (waterReminderInterval) clearInterval(waterReminderInterval);
    waterReminderInterval = setInterval(() => {
        showToast("💧 Water Reminder: Stay hydrated! Drink a glass of water.", "info", 5000);
    }, intervalMins * 60 * 1000);
    showToast(`Water reminder active every ${intervalMins} mins 💧`, "success");
};

window.stopWaterReminder = function () {
    if (waterReminderInterval) clearInterval(waterReminderInterval);
    showToast("Water reminder stopped.", "info");
};

// --------------------------------------------------------------------------
// HISTORY & NOTIFICATION CENTER LOGIC
// --------------------------------------------------------------------------
function listenHistory() {
    const q = query(collection(db, "users", currentUser.uid, "history"), orderBy("createdAt", "desc"));
    unsubscribeHistory = onSnapshot(q, snapshot => {
        historyItems = [];
        snapshot.forEach(docSnap => historyItems.push({ id: docSnap.id, ...docSnap.data() }));
        displayHistory();
        updateDashboardStats();
        updateAnalyticsCharts();
    });
}

function displayHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    if (historyItems.length === 0) {
        list.innerHTML = `<p class="empty-text">No past dose logs.</p>`;
        return;
    }

    list.innerHTML = "";
    historyItems.forEach(h => {
        list.innerHTML += `
            <div class="history-card">
                <span>${h.status} <b>${h.medicineName}</b> at ${formatTime(h.time)}</span>
            </div>
        `;
    });
}

window.filterHistoryByDate = function () {
    const filter = document.getElementById("historyFilterDate").value;
    const now = new Date();
    displayHistory();
};

// --------------------------------------------------------------------------
// UNIFIED ADHERENCE DATA & ANALYTICS COMPUTATION (Bug 3)
// --------------------------------------------------------------------------
window.getMedicareAdherenceStats = function() {
    // 1. Current day (today) calculation
    let takenToday = 0, pendingToday = 0, missedToday = 0;
    medicines.forEach(m => {
        (m.times || []).forEach(t => {
            if (t.taken) {
                takenToday++;
            } else if (t.scheduledForTomorrow) {
                // Scheduled for tomorrow (next occurrence) - not missed today
            } else if (t.missed || isMissed(t.time, t)) {
                missedToday++;
            } else {
                pendingToday++;
            }
        });
    });

    const totalToday = takenToday + pendingToday + missedToday;
    const percentToday = totalToday === 0 ? 0 : Math.round((takenToday / totalToday) * 100);

    // 2. 7-day breakdown from dose history & active medicines
    const now = new Date();
    const days = [];
    const dayLabels = [];
    let weeklyMissedCount = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const dateKey = `${yyyy}-${mm}-${dd}`;
        const dayName = d.toLocaleDateString([], { weekday: "short" });

        days.push({
            dateKey,
            label: dayName,
            isToday: i === 0,
            taken: 0,
            missed: 0,
            total: 0,
            adherence: 0
        });
        dayLabels.push(dayName);
    }

    // Populate from historyItems
    (historyItems || []).forEach(h => {
        let hDate = null;
        if (h.createdAt) {
            if (h.createdAt.toDate) hDate = h.createdAt.toDate();
            else if (h.createdAt.seconds) hDate = new Date(h.createdAt.seconds * 1000);
            else if (typeof h.createdAt === "string" || typeof h.createdAt === "number") hDate = new Date(h.createdAt);
        }
        if (!hDate || isNaN(hDate.getTime())) return;

        const yyyy = hDate.getFullYear();
        const mm = String(hDate.getMonth() + 1).padStart(2, "0");
        const dd = String(hDate.getDate()).padStart(2, "0");
        const hKey = `${yyyy}-${mm}-${dd}`;

        const bucket = days.find(b => b.dateKey === hKey);
        if (bucket) {
            const status = (h.status || "").toLowerCase();
            if (status.includes("taken") || status.includes("✅")) {
                bucket.taken++;
                bucket.total++;
            } else if (status.includes("missed") || status.includes("skip") || status.includes("❌") || status.includes("⚠️")) {
                bucket.missed++;
                bucket.total++;
                weeklyMissedCount++;
            }
        }
    });

    // Merge today's active medicines with today's bucket
    const todayBucket = days[days.length - 1];
    if (todayBucket) {
        if (takenToday > todayBucket.taken) todayBucket.taken = takenToday;
        if (missedToday > todayBucket.missed) todayBucket.missed = missedToday;
        todayBucket.total = todayBucket.taken + todayBucket.missed + pendingToday;
        weeklyMissedCount = days.reduce((sum, b) => sum + b.missed, 0);
    }

    // Calculate daily adherence percentage
    const adherenceTrend = [];
    const missedOverview = [];

    days.forEach(b => {
        if (b.total > 0) {
            b.adherence = Math.round((b.taken / b.total) * 100);
        } else {
            b.adherence = 0;
        }
        adherenceTrend.push(b.adherence);
        missedOverview.push(b.missed);
    });

    const hasData = (historyItems && historyItems.length > 0) || (medicines && medicines.length > 0);

    return {
        today: {
            taken: takenToday,
            pending: pendingToday,
            missed: missedToday,
            total: totalToday,
            percent: percentToday
        },
        weekly: {
            labels: dayLabels,
            adherenceTrend,
            missedOverview,
            totalMissed: weeklyMissedCount
        },
        hasData
    };
};

function updateDashboardStats() {
    const stats = window.getMedicareAdherenceStats();
    const today = stats.today;

    const todayAdh = document.getElementById("todayAdherence");
    if (todayAdh) todayAdh.innerText = `${today.percent}%`;
    const totMed = document.getElementById("totalMedicines");
    if (totMed) totMed.innerText = medicines.length;
    const takenMed = document.getElementById("takenMedicines");
    if (takenMed) takenMed.innerText = today.taken;
    const pendMed = document.getElementById("pendingMedicines");
    if (pendMed) pendMed.innerText = today.pending;
    const missMed = document.getElementById("missedMedicines");
    if (missMed) missMed.innerText = today.missed;
    const progFill = document.getElementById("progressFill");
    if (progFill) progFill.style.width = `${today.percent}%`;
    const progText = document.getElementById("progressText");
    if (progText) progText.innerText = `${today.percent}% completed today`;

    // Progress Ring offset
    const circle = document.getElementById("adherenceCircle");
    if (circle) {
        const circumference = 2 * Math.PI * 40; // 251.2
        const offset = circumference - (today.percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    // Low stock alerts
    const alertsContainer = document.getElementById("dashboardStockAlerts");
    if (alertsContainer) {
        const lowStockMeds = medicines.filter(m => m.stock <= 3);
        if (lowStockMeds.length > 0) {
            alertsContainer.innerHTML = lowStockMeds.map(m => `
                <div class="toast toast-warning" style="margin-bottom:12px;">
                    ⚠️ Low Stock Warning: <b>${m.name}</b> has only ${m.stock} doses remaining!
                </div>
            `).join("");
        } else {
            alertsContainer.innerHTML = "";
        }
    }

    updateNextDoseCountdown();
}

function updateNextDoseCountdown() {
    const textEl = document.getElementById("nextDoseText");
    const countEl = document.getElementById("nextDoseCountdown");
    if (!textEl) return;

    let next = null;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    medicines.forEach(m => {
        m.times.forEach(t => {
            if (!t.taken && !t.missed && !t.scheduledForTomorrow) {
                const [h, min] = t.time.split(":").map(Number);
                const doseMins = h * 60 + min;
                if (doseMins >= currentMins) {
                    if (!next || doseMins < next.mins) next = { name: m.name, time: t.time, mins: doseMins };
                }
            }
        });
    });

    if (next) {
        textEl.innerText = `${next.name} at ${formatTime(next.time)}`;
        const diffMins = next.mins - currentMins;
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        countEl.innerText = `in ${hrs > 0 ? hrs + "h " : ""}${mins}m`;
    } else {
        textEl.innerText = "No upcoming dose today 🎉";
        countEl.innerText = "";
    }
}

function updateAnalyticsCharts() {
    const stats = window.getMedicareAdherenceStats();

    // 1. Update stats cards with identical figures from unified data function
    const adhPct = document.getElementById("adherencePercent");
    if (adhPct) adhPct.innerText = `${stats.today.percent}%`;

    const missedWk = document.getElementById("missedThisWeek");
    if (missedWk) missedWk.innerText = stats.weekly.totalMissed;

    const appCount = document.getElementById("appointmentCount");
    if (appCount) appCount.innerText = appointments.length;

    const docCount = document.getElementById("doctorCount");
    if (docCount) docCount.innerText = doctors.length;

    // 2. Friendly empty state vs. Chart render
    const chartsContainer = document.getElementById("analyticsChartsContainer");
    const emptyStateEl = document.getElementById("analyticsEmptyState");

    if (!stats.hasData) {
        if (chartsContainer) chartsContainer.classList.add("hidden");
        if (emptyStateEl) emptyStateEl.classList.remove("hidden");
        return;
    }

    if (chartsContainer) chartsContainer.classList.remove("hidden");
    if (emptyStateEl) emptyStateEl.classList.add("hidden");

    const adherenceCtx = document.getElementById("weeklyAdherenceChart")?.getContext("2d");
    const missedCtx = document.getElementById("missedDosesChart")?.getContext("2d");

    if (adherenceCtx) {
        if (weeklyAdherenceChartInstance) weeklyAdherenceChartInstance.destroy();
        weeklyAdherenceChartInstance = new Chart(adherenceCtx, {
            type: "line",
            data: {
                labels: stats.weekly.labels,
                datasets: [{
                    label: "Adherence %",
                    data: stats.weekly.adherenceTrend,
                    borderColor: "#5b5ce2",
                    backgroundColor: "rgba(91, 92, 226, 0.1)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { min: 0, max: 100 }
                }
            }
        });
    }

    if (missedCtx) {
        if (missedDosesChartInstance) missedDosesChartInstance.destroy();
        missedDosesChartInstance = new Chart(missedCtx, {
            type: "bar",
            data: {
                labels: stats.weekly.labels,
                datasets: [{
                    label: "Missed Doses",
                    data: stats.weekly.missedOverview,
                    backgroundColor: "#ef4444"
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}

// --------------------------------------------------------------------------
// DUPLICATE HELPER & CLEAR OLD HISTORY (Bug 4)
// --------------------------------------------------------------------------
window.checkAndHandleDuplicates = async function () {
    if (!currentUser) return;

    const groups = {};
    medicines.forEach(m => {
        const timeKey = (m.times || []).map(t => t.time).sort().join(",");
        const key = `${(m.name || "").trim().toLowerCase()}__${(m.dosage || "").trim().toLowerCase()}__${m.familyMemberId || ""}__${timeKey}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });

    const duplicateGroups = Object.values(groups).filter(g => g.length > 1);

    if (duplicateGroups.length === 0) {
        showToast("No duplicate medicines found! All medicines are unique. ✨", "info");
        return;
    }

    const modal = document.getElementById("duplicateModal");
    const container = document.getElementById("duplicateListContainer");
    const cancelBtn = document.getElementById("duplicateCancelBtn");
    const deleteBtn = document.getElementById("duplicateDeleteBtn");
    const mergeBtn = document.getElementById("duplicateMergeBtn");

    if (!modal || !container) return;

    let html = "";
    duplicateGroups.forEach(group => {
        const prim = group[0];
        const timesStr = (prim.times || []).map(t => t.time).join(", ");
        const totalStock = group.reduce((sum, item) => sum + (item.stock || 0), 0);
        html += `
            <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px;">
                <p style="margin:0 0 4px 0;font-weight:600;">💊 ${prim.name} (${prim.dosage || 'No dose'}) - ${timesStr}</p>
                <p style="margin:0;font-size:12px;color:var(--text-secondary);">
                    Found <b>${group.length} copies</b> for ${prim.familyMemberName || 'Self'}. Combined stock: ${totalStock}
                </p>
            </div>
        `;
    });
    container.innerHTML = html;
    modal.classList.remove("hidden");

    const cleanup = () => {
        modal.classList.add("hidden");
        cancelBtn.onclick = null;
        deleteBtn.onclick = null;
        mergeBtn.onclick = null;
    };

    cancelBtn.onclick = cleanup;

    deleteBtn.onclick = async () => {
        cleanup();
        let deleted = 0;
        try {
            for (const group of duplicateGroups) {
                for (let i = 1; i < group.length; i++) {
                    await deleteDoc(doc(db, "users", currentUser.uid, "medicines", group[i].id));
                    deleted++;
                }
            }
            showToast(`Deleted ${deleted} duplicate medicine copies. Primary schedules kept.`, "success");
        } catch (e) {
            showToast("Error deleting duplicates: " + e.message, "danger");
        }
    };

    mergeBtn.onclick = async () => {
        cleanup();
        let merged = 0;
        try {
            for (const group of duplicateGroups) {
                const prim = group[0];
                const combinedStock = group.reduce((sum, item) => sum + (item.stock || 0), 0);
                await updateDoc(doc(db, "users", currentUser.uid, "medicines", prim.id), { stock: combinedStock });
                for (let i = 1; i < group.length; i++) {
                    await deleteDoc(doc(db, "users", currentUser.uid, "medicines", group[i].id));
                }
                merged++;
            }
            showToast(`Merged ${merged} duplicate group(s) with combined stocks!`, "success");
        } catch (e) {
            showToast("Error merging duplicates: " + e.message, "danger");
        }
    };
};

window.clearOldHistory = async function () {
    if (!currentUser) return;
    const confirmClear = await showConfirmModal(
        "Clear Old History",
        "Delete all missed/skipped dose logs older than 7 days?"
    );
    if (!confirmClear) return;

    try {
        const historyRef = collection(db, "users", currentUser.uid, "history");
        const snap = await getDocs(historyRef);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        let deleteCount = 0;
        const deletePromises = [];

        snap.forEach(dSnap => {
            const data = dSnap.data();
            let millis = null;
            if (data.createdAt?.toMillis) millis = data.createdAt.toMillis();
            else if (data.createdAt?.seconds) millis = data.createdAt.seconds * 1000;
            else if (data.createdAt) millis = new Date(data.createdAt).getTime();

            const status = (data.status || "").toLowerCase();
            const isMissedOrSkipped = status.includes("miss") || status.includes("skip") || status.includes("❌") || status.includes("⚠️");

            if (isMissedOrSkipped && millis && millis < sevenDaysAgo) {
                deleteCount++;
                deletePromises.push(deleteDoc(doc(db, "users", currentUser.uid, "history", dSnap.id)));
            }
        });

        await Promise.all(deletePromises);
        showToast(deleteCount > 0 ? `Cleared ${deleteCount} missed dose log(s) older than 7 days.` : "No missed dose logs older than 7 days found.", "info");
    } catch (e) {
        showToast("Error clearing old history: " + e.message, "danger");
    }
};

// Printable PDF Health Report Generator
window.downloadHealthReport = function () {
    if (!currentUserData) {
        showToast("User profile not loaded yet.", "warning");
        return;
    }

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast("PDF generator library loading... Please try again in a moment.", "warning");
            return;
        }

        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF();

        let y = 15;
        docPdf.setFontSize(18);
        docPdf.setTextColor(91, 92, 226); // Brand Purple #5b5ce2
        docPdf.text("MediCare Patient Health Report", 14, y);

        y += 8;
        docPdf.setFontSize(10);
        docPdf.setTextColor(100, 100, 100);
        docPdf.text(`Generated: ${new Date().toLocaleString()}`, 14, y);

        y += 10;
        docPdf.setFontSize(12);
        docPdf.setTextColor(30, 30, 30);
        docPdf.text(`Patient Name: ${currentUserData.name || "Patient"}`, 14, y);
        y += 6;
        docPdf.text(`Email: ${currentUserData.email || ""}`, 14, y);
        y += 6;
        docPdf.text(`Caregiver Code: ${currentUserData.caregiverCode || "N/A"}`, 14, y);

        y += 10;
        docPdf.setFontSize(14);
        docPdf.setTextColor(91, 92, 226);
        docPdf.text("Adherence & Health Summary", 14, y);

        y += 6;
        docPdf.setFontSize(11);
        docPdf.setTextColor(50, 50, 50);
        const adherenceText = document.getElementById("todayAdherence")?.innerText || "0%";
        const streakText = document.getElementById("streakCounter")?.innerText || "0 Days";
        docPdf.text(`Today's Adherence Rate: ${adherenceText}`, 14, y);
        y += 6;
        docPdf.text(`Current Adherence Streak: ${streakText}`, 14, y);

        y += 10;
        docPdf.setFontSize(14);
        docPdf.setTextColor(91, 92, 226);
        docPdf.text("Family Members", 14, y);

        y += 6;
        docPdf.setFontSize(11);
        docPdf.setTextColor(50, 50, 50);
        if (familyMembers.length === 0) {
            docPdf.text("No family members registered.", 14, y);
            y += 6;
        } else {
            familyMembers.forEach(fm => {
                docPdf.text(`• ${fm.name} (${fm.relation})`, 14, y);
                y += 6;
            });
        }

        y += 6;
        docPdf.setFontSize(14);
        docPdf.setTextColor(91, 92, 226);
        docPdf.text("Active Medicines", 14, y);

        y += 6;
        docPdf.setFontSize(10);
        docPdf.setTextColor(50, 50, 50);
        if (medicines.length === 0) {
            docPdf.text("No active medicines listed.", 14, y);
            y += 6;
        } else {
            medicines.forEach(m => {
                const timesStr = (m.times || []).map(t => t.time).join(", ");
                docPdf.text(`• ${m.name} | Dosage: ${m.dosage || '1 dose'} | Stock: ${m.stock} | Doses: ${timesStr}`, 14, y);
                y += 6;
            });
        }

        y += 6;
        docPdf.setFontSize(14);
        docPdf.setTextColor(91, 92, 226);
        docPdf.text("Scheduled Consultations", 14, y);

        y += 6;
        docPdf.setFontSize(10);
        docPdf.setTextColor(50, 50, 50);
        if (appointments.length === 0) {
            docPdf.text("No upcoming consultations.", 14, y);
            y += 6;
        } else {
            appointments.forEach(a => {
                docPdf.text(`• Dr. ${a.doctor} at ${a.hospital || 'Clinic'} on ${a.date} at ${a.time}`, 14, y);
                y += 6;
            });
        }

        const fileName = `MediCare_Health_Report_${(currentUserData?.name || 'Patient').replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        docPdf.save(fileName);
        showToast("PDF Health Report downloaded! 📄", "success");
    } catch (e) {
        showToast("Failed to generate PDF: " + e.message, "danger");
    }
};

// --------------------------------------------------------------------------
// SECTION B: SPOKEN REMINDERS SYSTEM & WEB SPEECH API
// --------------------------------------------------------------------------
let speechUtterance = null;
let repeatSpeechTimeout = null;
let currentAlertedDoseKey = null;
let speechUnlocked = false;

let speechSettings = {
    enabled: true,
    language: "en-IN",
    volume: 1.0,
    rate: 1.0,
    useAI: false
};

function loadSpeechSettings() {
    try {
        const saved = localStorage.getItem("medicare_speech_settings");
        if (saved) {
            speechSettings = Object.assign(speechSettings, JSON.parse(saved));
        }
    } catch (e) {}

    const toggle = document.getElementById("speakRemindersToggle");
    const langSel = document.getElementById("voiceLanguageSelect");
    const vol = document.getElementById("voiceVolume");
    const rate = document.getElementById("voiceRate");
    const aiToggle = document.getElementById("aiReminderPhraseToggle");

    if (toggle) toggle.checked = speechSettings.enabled;
    if (langSel) langSel.value = speechSettings.language;
    if (vol) {
        vol.value = Math.round(speechSettings.volume * 100);
        const volVal = document.getElementById("voiceVolumeVal");
        if (volVal) volVal.innerText = vol.value;
    }
    if (rate) {
        rate.value = speechSettings.rate;
        const rateVal = document.getElementById("voiceRateVal");
        if (rateVal) rateVal.innerText = rate.value;
    }
    if (aiToggle) aiToggle.checked = speechSettings.useAI;
}

// Initial speech settings load
loadSpeechSettings();

window.updateSpeechSettings = function () {
    const toggle = document.getElementById("speakRemindersToggle");
    const langSel = document.getElementById("voiceLanguageSelect");
    const vol = document.getElementById("voiceVolume");
    const rate = document.getElementById("voiceRate");
    const aiToggle = document.getElementById("aiReminderPhraseToggle");

    if (toggle) speechSettings.enabled = toggle.checked;
    if (langSel) speechSettings.language = langSel.value;
    if (vol) {
        speechSettings.volume = parseFloat(vol.value) / 100;
        const volVal = document.getElementById("voiceVolumeVal");
        if (volVal) volVal.innerText = vol.value;
    }
    if (rate) {
        speechSettings.rate = parseFloat(rate.value);
        const rateVal = document.getElementById("voiceRateVal");
        if (rateVal) rateVal.innerText = rate.value;
    }
    if (aiToggle) speechSettings.useAI = aiToggle.checked;

    try {
        localStorage.setItem("medicare_speech_settings", JSON.stringify(speechSettings));
    } catch (e) {}
};

function unlockSpeechAudio() {
    if (speechUnlocked) return;
    if (!("speechSynthesis" in window)) return;
    try {
        const dummy = new SpeechSynthesisUtterance("");
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
        speechUnlocked = true;
        console.log("[SpeechSynthesis] Speech audio unlocked via user interaction.");
    } catch (e) {}
}
document.addEventListener("click", unlockSpeechAudio, { capture: true });

function getBestVoice(langCode) {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length === 0) return null;

    const targetLang = (langCode || "en-IN").toLowerCase().replace("_", "-");
    const baseLang = targetLang.split("-")[0];

    // 1. Exact match (e.g. en-in, te-in, hi-in)
    let voice = voices.find(v => v.lang.toLowerCase().replace("_", "-") === targetLang);
    if (voice) return voice;

    // 2. Base language match (e.g. te, hi)
    voice = voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
    if (voice) return voice;

    // 3. Fallback to English voice (e.g. en-US, en-GB, or any en)
    voice = voices.find(v => v.lang.toLowerCase().startsWith("en"));
    if (voice) return voice;

    // 4. Default voice
    return voices[0];
}

window.speakReminderText = function (text) {
    if (!speechSettings.enabled) return;
    if (!("speechSynthesis" in window)) {
        console.warn("speechSynthesis API not supported");
        return;
    }

    try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = speechSettings.volume;
        utterance.rate = speechSettings.rate;

        const voice = getBestVoice(speechSettings.language);
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        }

        utterance.onerror = function (event) {
            console.warn("[SpeechSynthesis] Error:", event.error);
            if (event.error === "not-allowed") {
                showToast("Spoken reminders blocked by browser audio policy. Click anywhere on the page to unblock speech.", "warning");
            }
        };

        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.warn("[SpeechSynthesis] Speak failure:", err);
    }
};

window.speakConfirmation = function (text) {
    if (speechSettings.enabled) {
        speakReminderText(text);
    }
};

window.clearSpeechRepeatTimer = function () {
    if (repeatSpeechTimeout) {
        clearTimeout(repeatSpeechTimeout);
        repeatSpeechTimeout = null;
    }
    currentAlertedDoseKey = null;
};

window.testVoiceReminder = function () {
    unlockSpeechAudio();
    const name = currentUserData?.name || "Bhavya";
    const sampleMsg = `${name}, this is a test of MediCare spoken reminders. Stay healthy!`;
    const statusEl = document.getElementById("speechStatusMessage");

    const voice = getBestVoice(speechSettings.language);
    if (statusEl) {
        statusEl.innerText = voice ? `Using voice: ${voice.name} (${voice.lang})` : "Using default browser voice.";
    }

    speakReminderText(sampleMsg);
    showToast("Playing test voice reminder...", "info");
};

// --------------------------------------------------------------------------
// VOICE ASSISTANT & TWO-STEP PARSER
// --------------------------------------------------------------------------
let recognition = null;
let isVoiceListening = false;

window.toggleVoiceAssistant = function () {
    unlockSpeechAudio();
    if (isVoiceListening) {
        stopVoiceAssistant();
    } else {
        startVoiceAssistant();
    }
};

window.startVoiceAssistant = async function () {
    const textEl = document.getElementById("voiceText");
    const btn = document.getElementById("voiceBtn");

    if (!window.isSecureContext) {
        const msg = "Voice and notifications need HTTPS or localhost.";
        if (textEl) textEl.innerText = msg;
        showToast(msg, "warning");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        const msg = "Speech Recognition API is not supported in this browser. Please use Google Chrome or Edge.";
        if (textEl) textEl.innerText = msg;
        showToast(msg, "warning");
        return;
    }

    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        }
    } catch (permErr) {
        console.warn("Mic permission error:", permErr);
        const msg = "Microphone access denied. Please allow microphone permissions in your browser address bar.";
        if (textEl) textEl.innerText = msg;
        showToast(msg, "danger");
        return;
    }

    try {
        recognition = new SpeechRecognition();
        const langSelect = document.getElementById("voiceLanguage");
        recognition.lang = langSelect ? langSelect.value : "en-IN";
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = function () {
            isVoiceListening = true;
            if (btn) {
                btn.innerText = "🛑 Stop Voice Input";
                btn.style.background = "var(--danger-color)";
                btn.style.color = "#fff";
            }
            if (textEl) textEl.innerText = "Listening... Speak your command now (e.g. 'Add Dolo 650 at 8 PM stock 15').";
        };

        recognition.onresult = function (event) {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }

            // Always display raw transcript in the voice text box so user sees what was heard
            if (textEl) textEl.innerText = transcript;

            const isFinal = event.results[event.results.length - 1].isFinal;
            if (isFinal && transcript.trim()) {
                processVoiceCommand(transcript.trim());
            }
        };

        recognition.onerror = function (event) {
            console.error("Speech recognition error:", event.error);
            let errMsg = "Voice input error: " + event.error;
            if (event.error === "not-allowed") errMsg = "Microphone permission blocked. Please unblock mic in address bar.";
            else if (event.error === "no-speech") errMsg = "No speech detected. Please try speaking again.";
            else if (event.error === "audio-capture") errMsg = "No microphone hardware found.";
            else if (event.error === "network") errMsg = "Network connection error during speech recognition.";

            if (textEl) textEl.innerText = errMsg;
            showToast(errMsg, "danger");
            stopVoiceAssistant();
        };

        recognition.onend = function () {
            stopVoiceAssistant();
        };

        recognition.start();
    } catch (e) {
        showToast("Failed to start speech recognition: " + e.message, "danger");
        stopVoiceAssistant();
    }
};

function stopVoiceAssistant() {
    isVoiceListening = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
        recognition = null;
    }
    const btn = document.getElementById("voiceBtn");
    if (btn) {
        btn.innerText = "🎤 Start Voice Input";
        btn.style.background = "";
        btn.style.color = "";
    }
}

// --------------------------------------------------------------------------
// VOICE TRANSCRIPT NORMALIZATION, FUZZY MEDICINE MATCHER & PARSER (Bug 2)
// --------------------------------------------------------------------------
const COMMON_MEDICINES = [
    "dolo", "crocin", "paracetamol", "azithromycin", "metformin",
    "pantoprazole", "cetirizine", "amoxicillin", "aspirin", "ibuprofen",
    "omeprazole", "atorvastatin", "amlodipine", "losartan", "metoprolol",
    "augmentin", "combiflam", "calpol"
];

const SPEECH_MISHEARING_MAP = {
    "download": "dolo",
    "dollar": "dolo",
    "dollo": "dolo",
    "dolu": "dolo",
    "croaking": "crocin",
    "crow scene": "crocin",
    "croissant": "crocin",
    "parasite mall": "paracetamol",
    "parasitic mall": "paracetamol",
    "paracitamol": "paracetamol",
    "parasitemol": "paracetamol",
    "panto": "pantoprazole",
    "pantop": "pantoprazole",
    "azithro": "azithromycin",
    "as it through": "azithromycin",
    "amox": "amoxicillin",
    "a moxie": "amoxicillin"
};

function levenshteinDistance(s1, s2) {
    const a = (s1 || "").toLowerCase(), b = (s2 || "").toLowerCase();
    const costs = [];
    for (let i = 0; i <= a.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= b.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (a.charAt(i - 1) !== b.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[b.length] = lastValue;
    }
    return costs[b.length];
}

function stringSimilarity(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    return (maxLen - levenshteinDistance(s1, s2)) / maxLen;
}

function wordsToNumbers(text) {
    if (!text) return "";
    const numMap = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
        "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
        "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
    };

    let s = text;
    s = s.replace(/\bsix\s+hundred\s+(?:and\s+)?fifty\b/gi, "650");
    s = s.replace(/\bsix\s+fifty\b/gi, "650");
    s = s.replace(/\bfive\s+hundred\b/gi, "500");
    s = s.replace(/\bone\s+thousand\b/gi, "1000");

    for (const [w, n] of Object.entries(numMap)) {
        const regex = new RegExp(`\\b${w}\\b`, "gi");
        s = s.replace(regex, n.toString());
    }
    return s;
}

function matchCommonMedicine(token) {
    if (!token) return token;
    const clean = token.toLowerCase().trim();
    if (SPEECH_MISHEARING_MAP[clean]) {
        const mapped = SPEECH_MISHEARING_MAP[clean];
        return mapped.charAt(0).toUpperCase() + mapped.slice(1);
    }
    let best = null;
    let highestSim = 0;
    for (const med of COMMON_MEDICINES) {
        const sim = stringSimilarity(clean, med);
        if (sim > highestSim) {
            highestSim = sim;
            best = med;
        }
    }
    if (highestSim >= 0.55 && best) {
        return best.charAt(0).toUpperCase() + best.slice(1);
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
}

window.normaliseVoiceTranscript = function(raw) {
    if (!raw) return "";
    let s = raw.trim();

    // Standardize meridiem punctuation
    s = s.replace(/p\.m\./gi, "pm").replace(/a\.m\./gi, "am");
    s = s.replace(/\bp\s+m\b/gi, "pm").replace(/\ba\s+m\b/gi, "am");

    // Convert number words
    s = wordsToNumbers(s);

    // Look for misheard pattern where "650 at 8 pm" was heard as "658 pm" or "658 p.m."
    s = s.replace(/\b(\d{2,3})(8|9|10|11|12|[1-7])\s*(pm|am)\b/gi, (match, prefix, hr, meridiem) => {
        if (prefix === "65" || prefix === "650" || prefix === "50" || prefix === "25") {
            const actualPrefix = prefix.length === 2 ? prefix + "0" : prefix;
            return `${actualPrefix} at ${hr} ${meridiem}`;
        }
        return match;
    });

    // Check direct mishearing dictionary
    for (const [misheard, corrected] of Object.entries(SPEECH_MISHEARING_MAP)) {
        const re = new RegExp(`\\b${misheard}\\b`, "gi");
        s = s.replace(re, corrected);
    }

    return s;
};

window.parseVoiceLocally = function(transcript) {
    if (!transcript || typeof transcript !== "string") return null;

    const normalised = window.normaliseVoiceTranscript(transcript);
    const lower = normalised.toLowerCase();

    // 1. Stock parsing: "stock 15", "quantity 15", "15 tablets", "15 pieces", "15 pills"
    // Bug 2(b): Do NOT default silently to 10
    let stock = null;
    let stockSubstring = "";
    const stockMatch = normalised.match(/(?:stock|quantity|count)\s*(\d+)|\b(\d+)\s*(?:tablets?|capsules?|pills?|pieces?|units?|strips?|doses?)\b/i);
    if (stockMatch) {
        stock = parseInt(stockMatch[1] || stockMatch[2]);
        stockSubstring = stockMatch[0];
    }

    // 2. Dosage parsing: "650 mg", "500mg", "1 tablet", etc.
    let dosage = "";
    // Check if medicine is immediately followed by strength (e.g. Metformin 500, Dolo 650, Crocin 500)
    const medStrengthMatch = normalised.match(/\b(?:dolo|crocin|paracetamol|azithromycin|metformin|pantoprazole|cetirizine|amoxicillin|[a-zA-Z]+)\s+(\d{2,4})\s*(mg|g|ml|mcg)?\b/i);
    if (medStrengthMatch) {
        const num = medStrengthMatch[1];
        const unit = medStrengthMatch[2] || "mg";
        dosage = `${num} ${unit}`;
    } else {
        const mgMatch = normalised.match(/(\d+\s*(?:mg|g|ml|mcg))\b/i);
        if (mgMatch) {
            dosage = mgMatch[1].trim();
        } else {
            const otherDoseMatch = normalised.match(/(\d+\s*(?:tablets?|capsules?|pills?|pieces?|drops?|dose))\b/i);
            if (otherDoseMatch && (!stockSubstring || otherDoseMatch[0].toLowerCase() !== stockSubstring.toLowerCase())) {
                dosage = otherDoseMatch[1].trim();
            }
        }
    }

    // 3. Time & Meridiem Parsing: Bug 2(a)
    // "8 p.m.", "8 PM", "eight pm", "8 in the evening/night" must give 20:00
    // Only use AM when AM or morning is said. If no meridiem is spoken, flag meridiemAmbiguous.
    let times = [];
    let meridiemAmbiguous = false;

    // Direct AM/PM: e.g. "8 pm", "8:30 pm", "8 am"
    const ampmMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (ampmMatch) {
        let hrs = parseInt(ampmMatch[1]);
        const mins = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0;
        const ampm = ampmMatch[3].toLowerCase();
        if (ampm === "pm" && hrs < 12) hrs += 12;
        if (ampm === "am" && hrs === 12) hrs = 0;
        times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
    }

    // Evening / Night phrases: e.g. "8 in the evening", "8 in the night", "8 at night"
    if (times.length === 0) {
        const eveMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(evening|night|bedtime)\b/i);
        if (eveMatch) {
            let hrs = parseInt(eveMatch[1]);
            const mins = eveMatch[2] ? parseInt(eveMatch[2]) : 0;
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Morning phrases: e.g. "8 in the morning", "8 morning"
    if (times.length === 0) {
        const mornMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(morning)\b/i);
        if (mornMatch) {
            let hrs = parseInt(mornMatch[1]);
            const mins = mornMatch[2] ? parseInt(mornMatch[2]) : 0;
            if (hrs === 12) hrs = 0;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Afternoon phrases: e.g. "1 in the afternoon", "2 afternoon"
    if (times.length === 0) {
        const aftMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(afternoon)\b/i);
        if (aftMatch) {
            let hrs = parseInt(aftMatch[1]);
            const mins = aftMatch[2] ? parseInt(aftMatch[2]) : 0;
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Time specified without any meridiem: e.g. "at 8", "at 8:30"
    if (times.length === 0) {
        const plainAtMatch = normalised.match(/\b(?:at|around)\s*(\d{1,2})(?::(\d{2}))?\b/i);
        if (plainAtMatch) {
            let hrs = parseInt(plainAtMatch[1]);
            const mins = plainAtMatch[2] ? parseInt(plainAtMatch[2]) : 0;
            meridiemAmbiguous = true;
            // Only use AM when AM or morning is said. If no meridiem is spoken, ask in dialog and default to 20:00
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Keyword fallbacks
    if (times.length === 0) {
        if (lower.includes("morning") && (lower.includes("night") || lower.includes("evening"))) {
            times.push("08:00", "20:00");
        } else if (lower.includes("morning")) {
            times.push("08:00");
        } else if (lower.includes("afternoon")) {
            times.push("13:00");
        } else if (lower.includes("evening")) {
            times.push("18:00");
        } else if (lower.includes("night") || lower.includes("bedtime")) {
            times.push("20:00");
        } else {
            times.push("20:00");
            meridiemAmbiguous = true;
        }
    }

    // 4. Food timing
    let foodTiming = "After Food";
    if (lower.includes("before food") || lower.includes("before meal") || lower.includes("empty stomach")) {
        foodTiming = "Before Food";
    } else if (lower.includes("with food") || lower.includes("with meal")) {
        foodTiming = "With Food";
    } else if (lower.includes("anytime") || lower.includes("any time")) {
        foodTiming = "Anytime";
    }

    // 5. Repeat daily
    let repeatDaily = true;
    if (lower.includes("once") || lower.includes("today only") || lower.includes("not daily") || lower.includes("single dose")) {
        repeatDaily = false;
    }

    // 6. Name extraction & Fuzzy Medicine Matching: Bug 2(c)
    let clean = normalised.replace(/^(?:please\s+)?(?:add|take|remind\s+me\s+to\s+take|i\s+need\s+to\s+take|put)\s+/i, "");
    const nameMatch = clean.match(/^([a-zA-Z\s]+?)(?=\s+(?:\d+\s*(?:mg|g|ml|mcg|tablets?|capsules?|pills?|doses?|drop|drops)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|at|stock|every|before|after|with|morning|afternoon|evening|night|daily|$))/i);
    let rawName = nameMatch ? nameMatch[1].trim() : clean.split(/\s+(?:at|stock|\d)/i)[0].trim();

    if (rawName.toLowerCase().startsWith("add ")) rawName = rawName.substring(4).trim();
    if (rawName.toLowerCase().startsWith("take ")) rawName = rawName.substring(5).trim();

    const name = matchCommonMedicine(rawName);
    const isHighConfidence = name.length >= 2 && !["Medicine", "Pill", "Tablet", "Add", "Take"].includes(name);

    return {
        name: isHighConfidence ? name : "",
        dosage,
        times,
        stock,
        foodTiming,
        repeatDaily,
        meridiemAmbiguous,
        isHighConfidence
    };
};

window.showVoiceConfirmModal = function(parsed) {
    return new Promise((resolve) => {
        const modal = document.getElementById("voiceConfirmModal");
        if (!modal) {
            resolve(parsed);
            return;
        }

        const nameInput = document.getElementById("voiceParsedName");
        const dosageInput = document.getElementById("voiceParsedDosage");
        const timeInput = document.getElementById("voiceParsedTime");
        const meridiemSelect = document.getElementById("voiceParsedMeridiem");
        const stockInput = document.getElementById("voiceParsedStock");
        const stockHint = document.getElementById("voiceStockLabelHint");
        const foodSelect = document.getElementById("voiceParsedFood");
        const ambiguousWarning = document.getElementById("voiceAmbiguousWarning");
        const saveBtn = document.getElementById("voiceSaveBtn");
        const cancelBtn = document.getElementById("voiceCancelBtn");

        // Clear previous error highlights
        nameInput.classList.remove("input-highlight-error");
        dosageInput.classList.remove("input-highlight-error");
        stockInput.classList.remove("input-highlight-error");

        nameInput.value = parsed.name || "";
        if (!parsed.name) nameInput.classList.add("input-highlight-error");

        dosageInput.value = parsed.dosage || "";
        if (!parsed.dosage) dosageInput.classList.add("input-highlight-error");

        // Time & AM/PM
        let initialTime = (parsed.times && parsed.times[0]) ? parsed.times[0] : "20:00";
        timeInput.value = initialTime;
        const [h] = initialTime.split(":").map(Number);
        meridiemSelect.value = (h >= 12) ? "PM" : "AM";

        // Meridiem ambiguity warning
        if (parsed.meridiemAmbiguous) {
            ambiguousWarning.classList.remove("hidden");
        } else {
            ambiguousWarning.classList.add("hidden");
        }

        // Stock handling
        if (parsed.stock !== null && parsed.stock !== undefined && !isNaN(parsed.stock)) {
            stockInput.value = parsed.stock;
            if (stockHint) {
                stockHint.innerText = "(Spoken count)";
                stockHint.style.color = "var(--text-secondary)";
            }
        } else {
            stockInput.value = "";
            stockInput.classList.add("input-highlight-error");
            if (stockHint) {
                stockHint.innerText = "(Missing from command - please enter)";
                stockHint.style.color = "var(--danger-color)";
            }
        }

        if (foodSelect) foodSelect.value = parsed.foodTiming || "After Food";

        modal.classList.remove("hidden");

        const cleanup = () => {
            modal.classList.add("hidden");
            saveBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };

        saveBtn.onclick = () => {
            const finalName = nameInput.value.trim();
            const finalDosage = dosageInput.value.trim();
            const finalTime = timeInput.value;
            const finalMeridiem = meridiemSelect.value;
            const finalStockRaw = stockInput.value.trim();
            const finalStock = finalStockRaw !== "" ? parseInt(finalStockRaw) : 0;
            const finalFood = foodSelect ? foodSelect.value : "After Food";

            if (!finalName) {
                nameInput.classList.add("input-highlight-error");
                nameInput.focus();
                showToast("Medicine name is required.", "warning");
                return;
            }
            if (!finalDosage) {
                dosageInput.classList.add("input-highlight-error");
                dosageInput.focus();
                showToast("Dosage is required (e.g. 650 mg, 1 tablet).", "warning");
                return;
            }

            // Adjust time to match meridiem selection if user toggled AM/PM
            let [hrs, mins] = finalTime.split(":").map(Number);
            if (finalMeridiem === "PM" && hrs < 12) hrs += 12;
            if (finalMeridiem === "AM" && hrs >= 12) hrs -= 12;
            const adjustedTimeStr = `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;

            cleanup();
            resolve({
                name: finalName,
                dosage: finalDosage,
                times: [adjustedTimeStr],
                stock: finalStock,
                foodTiming: finalFood,
                repeatDaily: parsed.repeatDaily !== false
            });
        };
    });
};

async function processVoiceCommand(cmd) {
    const textEl = document.getElementById("voiceText");
    if (textEl) textEl.innerText = cmd;

    showPage("medicinePage");

    let parsed = null;
    const apiKey = localStorage.getItem("medicare_gemini_key");

    // Bug 2(d): Send raw transcript to Gemini first when user has a Gemini key
    if (apiKey) {
        try {
            showToast("Extracting medicine details with Gemini AI... 🤖", "info");
            const systemPrompt = `You are a precision medical voice assistant. The user dictated a medicine reminder.
IMPORTANT: Speech-to-text engines frequently mishear medicine names, dosages, and numbers (e.g. "add download 658 p.m." is a mishearing of "Add Dolo 650 at 8 PM", "croaking" for "Crocin", "parasitemol" for "Paracetamol").
Infer the intended medicine name from common medications (Dolo, Crocin, Paracetamol, etc.), proper dosage (e.g. 650 mg), times in 24hr HH:MM format ("8 PM", "8 p.m.", "8 in the evening/night" MUST be "20:00". Only use AM when AM or morning is specified), and stock count if spoken ("stock 15", "15 tablets", "quantity 15", "15 pieces").
Output ONLY valid JSON matching this exact structure:
{"name": string, "dosage": string, "times": string[], "meridiemAmbiguous": boolean, "stock": number | null, "foodTiming": "Before Food" | "After Food" | "With Food" | "Anytime", "repeatDaily": boolean, "confidence": number}`;

            const text = await window.callGemini(cmd, { systemInstruction: systemPrompt });
            if (text) {
                const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
                const aiParsed = JSON.parse(cleanJson);
                if (aiParsed && aiParsed.name) {
                    parsed = aiParsed;
                }
            }
        } catch (err) {
            console.warn("AI voice extraction fallback to local parser:", err);
        }
    }

    // Fallback to local parser
    if (!parsed || !parsed.name) {
        parsed = window.parseVoiceLocally(cmd);
    }

    if (!parsed) {
        parsed = { name: "", dosage: "", times: ["20:00"], stock: null, foodTiming: "After Food", repeatDaily: true, meridiemAmbiguous: true };
    }

    // Bug 2(e): Show editable confirmation modal
    const confirmedMedicine = await window.showVoiceConfirmModal(parsed);
    if (!confirmedMedicine) {
        showToast("Voice medicine save cancelled.", "info");
        return;
    }

    // Save directly to Firestore using confirmed fields
    try {
        const familySelect = document.getElementById("medicineFamilyMember");
        const familyMemberId = familySelect ? familySelect.value : "";
        const familyMemberName = familySelect && familySelect.selectedIndex >= 0 ? familySelect.options[familySelect.selectedIndex].text : "Self";

        const primaryTime = confirmedMedicine.times[0] || "20:00";
        const lowerName = confirmedMedicine.name.toLowerCase();
        const dosage = confirmedMedicine.dosage;

        // Duplicate detection with confirmation
        const isDuplicate = medicines.some(m => {
            const sameName = m.name.toLowerCase() === lowerName;
            const sameMember = (m.familyMemberId || "") === familyMemberId;
            const sameDose = (m.dosage || "").toLowerCase() === dosage.toLowerCase();
            const sameTime = m.times && m.times.some(t => t.time === primaryTime);
            return sameName && sameMember && sameDose && sameTime;
        });

        if (isDuplicate) {
            const allowDup = await showConfirmModal(
                "Duplicate Medicine Detected",
                `A medicine "${confirmedMedicine.name}" (${dosage}) at ${primaryTime} already exists for ${familyMemberName}.\n\nDo you want to save another copy anyway?`
            );
            if (!allowDup) {
                showToast("Cancelled saving duplicate medicine.", "info");
                return;
            }
        }

        // Check if scheduled time is earlier than current time today
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const [h, m] = primaryTime.split(":").map(Number);
        const doseMins = h * 60 + m;
        const isScheduledForTomorrow = doseMins <= currentMins;

        const times = confirmedMedicine.times.map(tStr => ({
            time: tStr,
            taken: false,
            missed: false,
            notified: false,
            scheduledForTomorrow: isScheduledForTomorrow
        }));

        let nextDueAt = null;
        const doseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
        if (doseDate.getTime() <= now.getTime()) {
            doseDate.setDate(doseDate.getDate() + 1);
        }
        nextDueAt = doseDate;

        const medicineData = {
            name: confirmedMedicine.name,
            dosage: confirmedMedicine.dosage,
            category: "Tablet",
            foodTiming: confirmedMedicine.foodTiming,
            stock: confirmedMedicine.stock || 0,
            expiryDate: "",
            repeatDaily: confirmedMedicine.repeatDaily !== false,
            times,
            notes: "Added via Voice Assistant",
            familyMemberId,
            familyMemberName,
            nextDueAt,
            enabled: true,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "users", currentUser.uid, "medicines"), medicineData);
        resetMedicineForm();

        if (isScheduledForTomorrow) {
            showToast(`"${confirmedMedicine.name}" saved! Scheduled for tomorrow (next occurrence) since today's time has passed. ⏰`, "success", 6000);
        } else {
            showToast(`"${confirmedMedicine.name}" added successfully! ✅`, "success");
        }
    } catch (err) {
        showToast("Error saving voice medicine: " + err.message, "danger");
    }
}

// --------------------------------------------------------------------------
// SECTION C: REMINDERS (In-App Checker, Web Audio, Spoken Reminders)
// --------------------------------------------------------------------------
function playReminderChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(659.25, now); // E5
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.5);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880.00, now + 0.25); // A5
        gain2.gain.setValueAtTime(0.3, now + 0.25);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.25);
        osc2.stop(now + 0.85);
    } catch (e) {
        console.warn("Audio chime notice:", e);
    }
}

const alertedDoseKeys = new Set();

window.checkInAppReminders = async function () {
    if (!currentUser || medicines.length === 0) return;
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    console.log(`[ReminderChecker] Checked ${medicines.length} medicines at ${now.toLocaleTimeString()} (${timeZone})`);

    for (const med of medicines) {
        if (!med.enabled || !med.times) continue;

        for (let idx = 0; idx < med.times.length; idx++) {
            const dose = med.times[idx];
            if (dose.taken) continue;

            const [h, m] = dose.time.split(":").map(Number);
            const dueToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
            const diffMs = now.getTime() - dueToday.getTime();
            const key = `${med.id}_${idx}_${now.toISOString().substring(0, 10)}`;

            if (diffMs >= 0 && diffMs <= 15 * 60 * 1000 && !alertedDoseKeys.has(key)) {
                alertedDoseKeys.add(key);

                playReminderChime();

                const badge = document.getElementById("notificationBadge");
                if (badge) {
                    let count = parseInt(badge.innerText || "0") + 1;
                    badge.innerText = count.toString();
                    badge.classList.remove("hidden");
                }

                if ("Notification" in window && Notification.permission === "granted") {
                    try {
                        new Notification("💊 MediCare Medicine Reminder", {
                            body: `Time to take ${med.name} (${med.dosage || '1 dose'}) for ${med.familyMemberName || 'Self'}.`,
                            icon: "https://cdn-icons-png.flaticon.com/512/2966/2966489.png"
                        });
                    } catch (nErr) { console.warn("Browser notification notice:", nErr); }
                }

                addNotificationLog(`Reminder: ${med.name} (${med.dosage}) due at ${formatTime(dose.time)}.`);

                // Spoken Reminder Announcement
                const userName = currentUserData?.name || "Bhavya";
                const medName = med.name;
                const dosageName = med.dosage || "1 dose";

                let spokenText = `${userName}, it is time to take ${medName}, ${dosageName}.`;

                if (speechSettings.enabled && speechSettings.useAI && currentUser) {
                    const apiKey = localStorage.getItem("medicare_gemini_key");
                    if (apiKey) {
                        try {
                            const systemInstruction = `You are a helpful caregiver. Generate a short, warm, one-sentence spoken reminder for the patient to take their medicine. No emojis. Output only the exact sentence.`;
                            const prompt = `Patient: ${userName}, Medicine: ${medName}, Dosage: ${dosageName}`;
                            const phrase = await window.callGemini(prompt, { systemInstruction });
                            if (phrase) spokenText = phrase.trim();
                        } catch (aiErr) {
                            console.warn("AI reminder phrase fallback notice:", aiErr);
                        }
                    }
                }

                // Speak immediately upon dose due dialog trigger
                speakReminderText(spokenText);

                // Setup 1-minute repeat once if not confirmed
                clearSpeechRepeatTimer();
                currentAlertedDoseKey = key;
                repeatSpeechTimeout = setTimeout(() => {
                    if (currentAlertedDoseKey === key && speechSettings.enabled) {
                        speakReminderText(`Reminder: ${userName}, please take your ${medName}.`);
                    }
                    repeatSpeechTimeout = null;
                    currentAlertedDoseKey = null;
                }, 60000);

                const choice = await showConfirmModal(
                    "⏰ Medicine Dose Due!",
                    `It is time to take ${med.name} (${med.dosage || '1 dose'}).\nScheduled: ${formatTime(dose.time)} for ${med.familyMemberName || 'Self'}.\n\nClick 'Confirm' to Mark Taken or 'Cancel' to Snooze 10m.`
                );

                clearSpeechRepeatTimer();

                if (choice) {
                    await markTaken(med.id, idx);
                } else {
                    await snoozeMedicine(med.id, idx);
                }
            } else if (diffMs > 15 * 60 * 1000 && !dose.missed && !dose.taken) {
                console.log(`[ReminderChecker] Dose ${med.name} at ${dose.time} missed (>15m). Auto-marking missed.`);
                await markMissedDose(med.id, idx);
            }
        }
    }
};

window.enableRemindersAndNotifications = async function () {
    const statusTextHeader = document.getElementById("notificationStatusText");
    const statusTextPage = document.getElementById("healthPagePermStatus");
    const helpBox = document.getElementById("notificationUnblockHelp");

    if (!("Notification" in window)) {
        showToast("Notifications are not supported by this browser.", "warning");
        return;
    }

    const permission = await Notification.requestPermission();
    console.log("[NotificationPermission] State:", permission);

    if (statusTextHeader) statusTextHeader.innerText = permission === "granted" ? "Reminders Enabled ✅" : "Enable Reminders";
    if (statusTextPage) statusTextPage.innerText = permission.toUpperCase();

    if (permission === "granted") {
        if (helpBox) helpBox.classList.add("hidden");
        showToast("Notifications enabled successfully! 🎉", "success");
        if (currentUser) initFCM(currentUser);
    } else if (permission === "denied") {
        if (helpBox) helpBox.classList.remove("hidden");
        showToast("Notification permission was denied. Follow instructions below to unblock.", "danger", 6000);
    } else {
        showToast("Notification permission dismissed.", "info");
    }
};

window.sendTestNotification = async function () {
    if (!("Notification" in window)) {
        showToast("Notifications not supported in this browser.", "warning");
        return;
    }

    if (Notification.permission !== "granted") {
        await enableRemindersAndNotifications();
        if (Notification.permission !== "granted") return;
    }

    try {
        new Notification("🧪 MediCare Test Notification", {
            body: "Push notification system, Service Worker, and FCM integration are active!",
            icon: "https://cdn-icons-png.flaticon.com/512/2966/2966489.png"
        });
        playReminderChime();
        showToast("Test notification sent! Check your notifications.", "success");
    } catch (e) {
        showToast("Failed to send test notification: " + e.message, "danger");
    }
};

window.clearNotificationHistory = async function () {
    if (!currentUser) return;
    const confirmClear = await showConfirmModal("Clear Notifications", "Clear all alert logs and notification history?");
    if (!confirmClear) return;

    try {
        const historyRef = collection(db, "users", currentUser.uid, "history");
        const snap = await getDocs(historyRef);
        const batchPromises = snap.docs.map(dSnap => deleteDoc(doc(db, "users", currentUser.uid, "history", dSnap.id)));
        await Promise.all(batchPromises);

        document.getElementById("caregiverAlertList").innerHTML = `<p class="empty-text">No recent alerts or notifications.</p>`;
        document.getElementById("notificationCenter").innerHTML = `<p class="empty-text">No recent notifications.</p>`;
        showToast("Notification history cleared!", "info");
    } catch (e) {
        showToast("Error clearing notification history: " + e.message, "danger");
    }
};

function addNotificationLog(message) {
    const center = document.getElementById("notificationCenter");
    if (!center) return;
    if (center.querySelector(".empty-text")) center.innerHTML = "";
    const div = document.createElement("div");
    div.className = "alert-card";
    div.innerHTML = `<p><b>🔔 Notification</b>: ${message}</p><small>${new Date().toLocaleTimeString()}</small>`;
    center.prepend(div);
}

// Helper formatters
function isMissed(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    return (now.getHours() * 60 + now.getMinutes()) > (h * 60 + m + 30);
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":");
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

setInterval(() => {
    updateDashboardStats();
    checkInAppReminders();
}, 30000);