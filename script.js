if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
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

const firebaseConfig = {
    apiKey: "AIzaSyAjwRvLU0QITWM6XUdU6iCbqGCu71uI3WU",
    authDomain: "medicare-5011c.firebaseapp.com",
    projectId: "medicare-5011c",
    storageBucket: "medicare-5011c.firebasestorage.app",
    messagingSenderId: "417059900592",
    appId: "1:417059900592:web:7bad70ab56f29a9dc27f75"
};

let GEMINI_API_KEY = localStorage.getItem("userGeminiKey") || "";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;

let medicines = [];
let appointments = [];
let historyItems = [];
let familyMembers = [];
let caregiverAlerts = [];
let doctors = [];

let unsubscribeMedicines = null;
let unsubscribeAppointments = null;
let unsubscribeHistory = null;
let unsubscribeFamilyMembers = null;
let unsubscribeCaregiverAlerts = null;
let unsubscribeDoctors = null;

let snoozeMap = {};
let expiryAlertMap = {};

let waterReminderStarted = false;
let waterReminderInterval = null;

function createCaregiverCode(userId) {
    return "CG-" + userId.substring(0, 8).toUpperCase();
}

async function createUserDocument(user, nameValue) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        const userName = nameValue || user.email.split("@")[0];

        await setDoc(userRef, {
            name: userName,
            email: user.email,
            caregiverCode: createCaregiverCode(user.uid),
            createdAt: serverTimestamp(),
            settings: {
                theme: "light",
                sound: true,
                voice: true
            }
        });
    }
}

function showNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body });
    }
    const center = document.getElementById("notificationCenter");
    if (center) {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        center.insertAdjacentHTML("afterbegin", `
            <div class="alert-card" style="border-left-color: #5b5ce2; margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; color:#6b7280; margin-bottom:4px;">
                    <b>${title}</b><span>${timeStr}</span>
                </div>
                <p style="font-size:14px; margin:0; color:inherit;">${body}</p>
            </div>
        `);
    }
}

function speakText(text) {
    if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
}

window.signup = async function () {
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const msg = document.getElementById("authMessage");

    msg.innerText = "";

    if (name === "" || email === "" || password === "") {
        msg.innerText = "Please fill all fields";
        return;
    }

    if (firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
        msg.style.color = "#f97316";
        msg.innerText = "⚠️ Please configure your Firebase API keys in script.js before creating an account! See README.md.";
        return;
    }

    if (password.length < 6) {
        msg.innerText = "Password must be at least 6 characters";
        return;
    }

    try {
        msg.style.color = "#5b5ce2";
        msg.innerText = "Creating account...";

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await createUserDocument(userCredential.user, name);

        msg.style.color = "green";
        msg.innerText = "Account created successfully ✅";
    } catch (error) {
        msg.style.color = "red";
        msg.innerText = error.message;
    }
};

window.login = async function () {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    const msg = document.getElementById("authMessage");

    msg.innerText = "";

    if (email === "" || password === "") {
        msg.innerText = "Enter email and password";
        return;
    }

    if (firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
        msg.style.color = "#f97316";
        msg.innerText = "⚠️ Please configure your Firebase API keys in script.js before logging in! See README.md.";
        return;
    }

    try {
        msg.style.color = "#5b5ce2";
        msg.innerText = "Logging in...";

        await signInWithEmailAndPassword(auth, email, password);

        msg.style.color = "green";
        msg.innerText = "Login successful ✅";
    } catch (error) {
        msg.style.color = "red";
        msg.innerText = error.message;
    }
};

window.logout = async function () {
    if (unsubscribeMedicines) unsubscribeMedicines();
    if (unsubscribeAppointments) unsubscribeAppointments();
    if (unsubscribeHistory) unsubscribeHistory();
    if (unsubscribeFamilyMembers) unsubscribeFamilyMembers();
    if (unsubscribeCaregiverAlerts) unsubscribeCaregiverAlerts();
    if (unsubscribeDoctors) unsubscribeDoctors();

    await signOut(auth);
};

onAuthStateChanged(auth, async function (user) {
    if (user) {
        currentUser = user;

        await createUserDocument(user, "");

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        currentUserData = userSnap.data();

        document.getElementById("authPage").classList.add("hidden");
        document.getElementById("appPage").classList.remove("hidden");

        document.getElementById("welcomeText").innerText =
            "Welcome, " + currentUserData.name + " 👋";

        document.getElementById("caregiverCodeText").innerText =
            currentUserData.caregiverCode;

        document.getElementById("myCaregiverCode").innerText =
            currentUserData.caregiverCode;

        loadTheme();
        loadEmergencyContact();

        listenMedicines();
        listenAppointments();
        listenHistory();
        listenFamilyMembers();
        listenCaregiverAlerts();
        listenDoctors();

        loadPrescriptions();
    } else {
        currentUser = null;

        document.getElementById("authPage").classList.remove("hidden");
        document.getElementById("appPage").classList.add("hidden");
    }
});

window.scrollToSection = function (id) {
    document.getElementById(id).scrollIntoView({ behavior: "smooth" });
};

window.addTimeField = function () {
    const input = document.createElement("input");
    input.type = "time";
    input.className = "medicineTime";
    document.getElementById("timeInputs").appendChild(input);
};

window.addMedicine = async function () {
    if (!currentUser) {
        alert("Please login first");
        return;
    }

    const editId = document.getElementById("editMedicineId").value || "";
    const name = document.getElementById("medicineName").value.trim();
    const category = document.getElementById("medicineCategory").value;
    const stock = Number(document.getElementById("medicineStock").value);
    const expiryDate = document.getElementById("medicineExpiry").value;
    const repeatDaily = document.getElementById("repeatDaily").checked;
    const timeInputs = document.querySelectorAll(".medicineTime");

    const familySelect = document.getElementById("medicineFamilyMember");

    let familyMemberId = "";
    let familyMemberName = "Self";

    if (familySelect && familySelect.value !== "") {
        familyMemberId = familySelect.value;
        familyMemberName = familySelect.options[familySelect.selectedIndex].text;
    }

    if (name === "") {
        alert("Enter medicine name");
        return;
    }

    if (category === "") {
        alert("Select medicine category");
        return;
    }

    if (isNaN(stock) || stock < 0) {
        alert("Enter valid stock count");
        return;
    }

    let times = [];

    timeInputs.forEach(input => {
        if (input.value !== "") {
            times.push({
                time: input.value,
                taken: false,
                missed: false,
                notified: false
            });
        }
    });

    if (times.length === 0) {
        alert("Add at least one time");
        return;
    }

    const medicineData = {
        name,
        category,
        stock: stock || 0,
        expiryDate,
        repeatDaily,
        times,
        familyMemberId,
        familyMemberName
    };

    try {
        if (editId) {
            await updateDoc(
                doc(db, "users", currentUser.uid, "medicines", editId),
                medicineData
            );

            alert("Medicine updated successfully ✅");
        } else {
            await addDoc(
                collection(db, "users", currentUser.uid, "medicines"),
                {
                    ...medicineData,
                    createdAt: serverTimestamp()
                }
            );

            alert("Medicine saved successfully ✅");
        }

        resetMedicineForm();
    } catch (error) {
        alert("Error saving medicine: " + error.message);
        console.log(error);
    }
};

function resetMedicineForm() {
    document.getElementById("editMedicineId").value = "";
    document.getElementById("medicineName").value = "";
    document.getElementById("medicineCategory").value = "";
    document.getElementById("medicineStock").value = "";
    document.getElementById("medicineExpiry").value = "";
    document.getElementById("repeatDaily").checked = false;

    const familySelect = document.getElementById("medicineFamilyMember");
    if (familySelect) {
        familySelect.value = "";
    }

    document.getElementById("timeInputs").innerHTML =
        `<input type="time" class="medicineTime">`;
}

function listenMedicines() {
    const q = query(
        collection(db, "users", currentUser.uid, "medicines"),
        orderBy("createdAt", "desc")
    );

    unsubscribeMedicines = onSnapshot(q, snapshot => {
        medicines = [];

        snapshot.forEach(docSnap => {
            medicines.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        displayMedicines();
        updateStats();
        updateNextDose();
        updateAnalytics();
    });
}

function getExpiryBadge(medicine) {
    if (!medicine.expiryDate) {
        return `<span class="badge">Expiry: Not set</span>`;
    }

    const today = new Date();
    const expiry = new Date(medicine.expiryDate);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return `<span class="badge badge-danger">Expired</span>`;
    }

    if (diffDays <= 3) {
        return `<span class="badge badge-warning">Expires in ${diffDays} day(s)</span>`;
    }

    return `<span class="badge">Expiry: ${medicine.expiryDate}</span>`;
}

function displayMedicines() {
    const list = document.getElementById("medicineList");
    const searchBox = document.getElementById("searchMedicine");
    const memberFilter = document.getElementById("medicineFilterMember")?.value || "";

    const searchValue = searchBox ? searchBox.value.toLowerCase() : "";

    if (!list) return;

    list.innerHTML = "";

    let filteredMedicines = medicines.filter(medicine => {
        const matchesSearch =
            medicine.name.toLowerCase().includes(searchValue) ||
            medicine.category.toLowerCase().includes(searchValue) ||
            (medicine.familyMemberName || "Self").toLowerCase().includes(searchValue);

        const matchesMember =
            memberFilter === "" ||
            medicine.familyMemberId === memberFilter;

        return matchesSearch && matchesMember;
    });

    if (filteredMedicines.length === 0) {
        list.innerHTML = `<div class="medicine-card">No medicines found.</div>`;
        return;
    }

    filteredMedicines.forEach(medicine => {
        let doses = "";

        medicine.times.forEach((dose, index) => {
            let status = "Pending";
            let takenDisabled = "";
            let snoozeDisabled = "";

            if (dose.taken) {
                status = "Taken ✅";
                takenDisabled = "disabled";
                snoozeDisabled = "disabled";
            } else if (dose.missed || isMissed(dose.time)) {
                status = "Missed ❌";
            }

            doses += `
                <div class="dose-row">
                    <span>⏰ ${formatTime(dose.time)} - ${status}</span>

                    <button class="taken-btn"
                        onclick="markTaken('${medicine.id}', ${index})"
                        ${takenDisabled}>
                        Mark Taken
                    </button>

                    <button class="snooze-btn"
                        onclick="snoozeMedicine('${medicine.id}', ${index})"
                        ${snoozeDisabled}>
                        Snooze
                    </button>
                </div>
            `;
        });

        list.innerHTML += `
            <div class="medicine-card">
                <div class="medicine-header">
                    <div>
                        <h3>${medicine.name}</h3>
                        <span class="badge">${medicine.category}</span>
                        <span class="badge">Stock: ${medicine.stock}</span>
                        <span class="badge">${medicine.repeatDaily ? "Daily" : "One Time"}</span>
                        <span class="badge">For: ${medicine.familyMemberName || "Self"}</span>
                        ${getExpiryBadge(medicine)}
                    </div>

                    <div>
                        <button onclick="editMedicine('${medicine.id}')">Edit</button>
                        <button onclick="refillStock('${medicine.id}')">Refill</button>
                        <button class="delete-btn" onclick="deleteMedicine('${medicine.id}')">Delete</button>
                    </div>
                </div>

                ${doses}
            </div>
        `;
    });
}

window.displayMedicines = displayMedicines;

window.editMedicine = function (medicineId) {
    const medicine = medicines.find(m => m.id === medicineId);
    if (!medicine) return;

    document.getElementById("editMedicineId").value = medicine.id;
    document.getElementById("medicineName").value = medicine.name;
    document.getElementById("medicineCategory").value = medicine.category;
    document.getElementById("medicineStock").value = medicine.stock;
    document.getElementById("medicineExpiry").value = medicine.expiryDate || "";
    document.getElementById("repeatDaily").checked = medicine.repeatDaily;

    const familySelect = document.getElementById("medicineFamilyMember");
    if (familySelect) {
        familySelect.value = medicine.familyMemberId || "";
    }

    document.getElementById("timeInputs").innerHTML = "";

    medicine.times.forEach(dose => {
        const input = document.createElement("input");
        input.type = "time";
        input.className = "medicineTime";
        input.value = dose.time;
        document.getElementById("timeInputs").appendChild(input);
    });

    scrollToSection("medicineSection");
};

window.markTaken = async function (medicineId, index) {
    const medicine = medicines.find(m => m.id === medicineId);
    if (!medicine) return;

    if (medicine.times[index].taken) {
        alert("This dose is already marked as taken.");
        return;
    }

    if (medicine.stock <= 0) {
        alert("⚠ Out of stock!\nPlease refill your medicine.");
        return;
    }

    medicine.times[index].taken = true;
    medicine.times[index].missed = false;
    medicine.stock--;

    const key = medicineId + "_" + index;
    delete snoozeMap[key];

    await updateDoc(doc(db, "users", currentUser.uid, "medicines", medicineId), {
        times: medicine.times,
        stock: medicine.stock
    });

    await addDoc(collection(db, "users", currentUser.uid, "history"), {
        medicineName: medicine.name,
        time: medicine.times[index].time,
        status: "Taken ✅",
        createdAt: serverTimestamp()
    });

    if (medicine.stock <= 3) {
        showNotification(
            "💊 Low Stock Reminder",
            medicine.name + " has only " + medicine.stock + " left."
        );

        alert("Low stock reminder: " + medicine.name + " has only " + medicine.stock + " left.");
    }
};

window.refillStock = async function (medicineId) {
    const medicine = medicines.find(m => m.id === medicineId);

    if (!medicine) {
        alert("Medicine not found");
        return;
    }

    const newStock = prompt(
        "Enter new stock quantity for " + medicine.name + ":",
        medicine.stock
    );

    if (newStock === null) return;

    const stockNumber = Number(newStock);

    if (isNaN(stockNumber) || stockNumber < 0) {
        alert("Please enter a valid stock number");
        return;
    }

    await updateDoc(
        doc(db, "users", currentUser.uid, "medicines", medicineId),
        { stock: stockNumber }
    );

    alert("Stock updated successfully ✅");
};

window.deleteMedicine = async function (medicineId) {
    if (!confirm("Delete this medicine?")) return;

    await deleteDoc(doc(db, "users", currentUser.uid, "medicines", medicineId));
};

window.snoozeMedicine = function (medicineId, index) {
    const medicine = medicines.find(m => m.id === medicineId);
    if (!medicine) return;

    if (medicine.times[index].taken) {
        alert("This medicine is already taken.");
        return;
    }

    const key = medicineId + "_" + index;
    snoozeMap[key] = Date.now() + 2 * 60 * 1000;

    alert(medicine.name + " snoozed for 2 minutes.");
};

function updateStats() {
    let total = medicines.length;
    let taken = 0;
    let pending = 0;
    let missed = 0;

    medicines.forEach(medicine => {
        medicine.times.forEach(dose => {
            if (dose.taken) taken++;
            else if (dose.missed || isMissed(dose.time)) missed++;
            else pending++;
        });
    });

    document.getElementById("totalMedicines").innerText = total;
    document.getElementById("takenMedicines").innerText = taken;
    document.getElementById("pendingMedicines").innerText = pending;
    document.getElementById("missedMedicines").innerText = missed;

    const familyCountBox = document.getElementById("familyCount");
    if (familyCountBox) {
        familyCountBox.innerText = familyMembers.length;
    }

    const totalDoses = taken + pending + missed;
    const percent = totalDoses === 0 ? 0 : Math.round((taken / totalDoses) * 100);

    document.getElementById("progressFill").style.width = percent + "%";
    document.getElementById("progressText").innerText = percent + "% completed";

    drawWeeklyChart();
    updateAnalytics();
}

function updateNextDose() {
    const box = document.getElementById("nextDoseText");
    if (!box) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let next = null;

    medicines.forEach(medicine => {
        medicine.times.forEach(dose => {
            if (!dose.taken && !dose.missed) {
                const [h, m] = dose.time.split(":");
                const mins = Number(h) * 60 + Number(m);

                if (mins >= currentMinutes) {
                    if (!next || mins < next.mins) {
                        next = {
                            name: medicine.name,
                            time: dose.time,
                            mins
                        };
                    }
                }
            }
        });
    });

    if (next) {
        box.innerText = next.name + " at " + formatTime(next.time);
    } else {
        box.innerText = "No upcoming dose today 🎉";
    }
}

function isMissed(time) {
    const [h, m] = time.split(":");
    const medicineMinutes = Number(h) * 60 + Number(m);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return currentMinutes > medicineMinutes + 30;

    // For testing, use:
    // return currentMinutes > medicineMinutes + 1;
}

function formatTime(time) {
    const [h, m] = time.split(":");
    const date = new Date();
    date.setHours(h);
    date.setMinutes(m);

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

window.addAppointment = async function () {
    const doctor = document.getElementById("doctorName").value.trim();
    const hospital = document.getElementById("hospitalName").value.trim();
    const date = document.getElementById("appointmentDate").value;
    const time = document.getElementById("appointmentTime").value;
    const notes = document.getElementById("appointmentNotes").value.trim();

    if (doctor === "" || date === "" || time === "") {
        alert("Enter doctor, date and time");
        return;
    }

    await addDoc(collection(db, "users", currentUser.uid, "appointments"), {
        doctor,
        hospital,
        date,
        time,
        notes,
        notified: false,
        createdAt: serverTimestamp()
    });

    document.getElementById("doctorName").value = "";
    document.getElementById("hospitalName").value = "";
    document.getElementById("appointmentDate").value = "";
    document.getElementById("appointmentTime").value = "";
    document.getElementById("appointmentNotes").value = "";
};

function listenAppointments() {
    const q = query(
        collection(db, "users", currentUser.uid, "appointments"),
        orderBy("createdAt", "desc")
    );

    unsubscribeAppointments = onSnapshot(q, snapshot => {
        appointments = [];

        const list = document.getElementById("appointmentList");
        list.innerHTML = "";

        snapshot.forEach(docSnap => {
            const app = {
                id: docSnap.id,
                ...docSnap.data()
            };

            appointments.push(app);

            list.innerHTML += `
                <div class="appointment-card">
                    <h3>${app.doctor}</h3>
                    <p>${app.hospital}</p>
                    <p>${app.date} - ${formatTime(app.time)}</p>
                    <p>${app.notes || ""}</p>
                </div>
            `;
        });

        updateAnalytics();
    });
}

function listenHistory() {
    const q = query(
        collection(db, "users", currentUser.uid, "history"),
        orderBy("createdAt", "desc")
    );

    unsubscribeHistory = onSnapshot(q, snapshot => {
        historyItems = [];

        const list = document.getElementById("historyList");
        list.innerHTML = "";

        snapshot.forEach(docSnap => {
            const h = {
                id: docSnap.id,
                ...docSnap.data()
            };

            historyItems.push(h);

            list.innerHTML += `
                <div class="history-card">
                    ${h.status} ${h.medicineName} - ${formatTime(h.time)}
                </div>
            `;
        });

        drawWeeklyChart();
        updateAnalytics();
    });
}

function drawWeeklyChart() {
    const canvas = document.getElementById("weeklyChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const takenCount = historyItems.filter(h => h.status === "Taken ✅").length;
    const missedCount = historyItems.filter(h => h.status === "Missed ❌").length;

    ctx.font = "16px Arial";

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(80, 80, takenCount * 30, 35);
    ctx.fillText("Taken: " + takenCount, 80, 70);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(80, 150, missedCount * 30, 35);
    ctx.fillText("Missed: " + missedCount, 80, 140);

    ctx.fillStyle = "#1f2937";
    ctx.fillText("Weekly Taken vs Missed", 80, 30);
}

window.loadCaregiverView = async function () {
    const code = document.getElementById("caregiverSearchCode").value.trim();
    const box = document.getElementById("caregiverData");

    if (code === "") {
        alert("Enter caregiver code");
        return;
    }

    const q = query(
        collection(db, "users"),
        where("caregiverCode", "==", code)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
        box.innerHTML = "No patient found with this code.";
        return;
    }

    const patientDoc = snap.docs[0];
    const patient = patientDoc.data();

    const medsSnap = await getDocs(
        collection(db, "users", patientDoc.id, "medicines")
    );

    let html = `<h3>Patient: ${patient.name}</h3>`;

    medsSnap.forEach(docSnap => {
        const m = docSnap.data();

        html += `
            <div class="medicine-card">
                <h3>${m.name}</h3>
                <p>${m.category}</p>
                <p>Stock: ${m.stock}</p>
                <p>For: ${m.familyMemberName || "Self"}</p>
            </div>
        `;
    });

    box.innerHTML = html;
};

function checkAppointmentReminders(currentDate, currentTime) {
    appointments.forEach(async app => {
        if (
            app.date === currentDate &&
            app.time === currentTime &&
            !app.notified
        ) {
            showNotification(
                "📅 Appointment Reminder",
                "Appointment with " + app.doctor
            );

            speakText("You have an appointment with " + app.doctor);

            await updateDoc(
                doc(db, "users", currentUser.uid, "appointments", app.id),
                {
                    notified: true
                }
            );
        }
    });
}

function checkExpiryAlerts() {
    const today = new Date();

    medicines.forEach(medicine => {
        if (!medicine.expiryDate) return;

        const expiry = new Date(medicine.expiryDate);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

        const key = medicine.id + "_" + diffDays;

        if (expiryAlertMap[key]) return;

        if (diffDays === 3) {
            expiryAlertMap[key] = true;
            showNotification("⚠ Medicine Expiry Alert", medicine.name + " expires in 3 days.");
        }

        if (diffDays === 0) {
            expiryAlertMap[key] = true;
            showNotification("🚨 Medicine Expires Today", medicine.name + " expires today.");
        }

        if (diffDays < 0) {
            expiryAlertMap[key] = true;
            showNotification("❌ Medicine Expired", medicine.name + " is expired. Do not use without doctor advice.");
        }
    });
}

async function checkMissedDoseAlerts() {
    for (let medicine of medicines) {
        for (let index = 0; index < medicine.times.length; index++) {
            const dose = medicine.times[index];

            if (isMissed(dose.time) && !dose.taken && !dose.missed) {
                medicine.times[index].missed = true;

                const message =
                    (medicine.familyMemberName || "Self") +
                    " missed " +
                    medicine.name +
                    " at " +
                    formatTime(dose.time);

                await updateDoc(
                    doc(db, "users", currentUser.uid, "medicines", medicine.id),
                    {
                        times: medicine.times
                    }
                );

                await addDoc(
                    collection(db, "users", currentUser.uid, "caregiverAlerts"),
                    {
                        medicineName: medicine.name,
                        familyMemberName: medicine.familyMemberName || "Self",
                        time: dose.time,
                        message,
                        createdAt: serverTimestamp()
                    }
                );

                await addDoc(
                    collection(db, "users", currentUser.uid, "history"),
                    {
                        medicineName: medicine.name,
                        time: dose.time,
                        status: "Missed ❌",
                        createdAt: serverTimestamp()
                    }
                );

                showNotification("⚠ Missed Dose Alert", message);
                alert("⚠ Missed Dose Alert\n\n" + message);
            }
        }
    }
}

function listenCaregiverAlerts() {
    const q = query(
        collection(db, "users", currentUser.uid, "caregiverAlerts"),
        orderBy("createdAt", "desc")
    );

    unsubscribeCaregiverAlerts = onSnapshot(q, snapshot => {
        caregiverAlerts = [];

        snapshot.forEach(docSnap => {
            caregiverAlerts.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        displayCaregiverAlerts();
    });
}

function displayCaregiverAlerts() {
    const list = document.getElementById("caregiverAlertList");
    if (!list) return;

    list.innerHTML = "";

    if (caregiverAlerts.length === 0) {
        list.innerHTML = `<div class="medicine-card">No caregiver alerts yet.</div>`;
        return;
    }

    caregiverAlerts.forEach(alertItem => {
        list.innerHTML += `
            <div class="alert-card">
                <h3>⚠ Missed Dose</h3>
                <p>${alertItem.message}</p>
            </div>
        `;
    });
}

window.toggleTheme = async function () {
    document.body.classList.toggle("dark-mode");

    const theme = document.body.classList.contains("dark-mode")
        ? "dark"
        : "light";

    if (currentUser) {
        await updateDoc(doc(db, "users", currentUser.uid), {
            "settings.theme": theme
        });
    }
};

function loadTheme() {
    if (currentUserData?.settings?.theme === "dark") {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

setInterval(async () => {
    if (!currentUser) return;

    const now = new Date();

    const currentDate =
        now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0");

    const currentTime =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");

    checkAppointmentReminders(currentDate, currentTime);
    checkExpiryAlerts();
    await checkMissedDoseAlerts();

    for (let medicine of medicines) {
        for (let index = 0; index < medicine.times.length; index++) {
            const dose = medicine.times[index];
            const key = medicine.id + "_" + index;
            const snoozedUntil = snoozeMap[key];

            if (
                currentTime === dose.time &&
                !dose.taken &&
                !dose.notified &&
                !snoozedUntil
            ) {
                showNotification("💊 Medicine Reminder", "Take " + medicine.name);
                speakText("Take your medicine " + medicine.name);

                medicine.times[index].notified = true;

                await updateDoc(
                    doc(db, "users", currentUser.uid, "medicines", medicine.id),
                    { times: medicine.times }
                );
            }

            if (
                snoozedUntil &&
                Date.now() >= snoozedUntil &&
                !dose.taken
            ) {
                showNotification("💊 Snooze Reminder", "Take " + medicine.name);
                speakText("Take your medicine " + medicine.name);
                alert("Reminder: Take " + medicine.name);
                delete snoozeMap[key];
            }

            if (currentTime !== dose.time && dose.notified) {
                medicine.times[index].notified = false;

                await updateDoc(
                    doc(db, "users", currentUser.uid, "medicines", medicine.id),
                    { times: medicine.times }
                );
            }
        }
    }

    updateStats();
    updateNextDose();
    updateAnalytics();
}, 1000);

window.startWaterReminder = function () {
    if (waterReminderStarted) {
        alert("Water reminder is already running.");
        return;
    }

    waterReminderStarted = true;

    alert("Water reminder started 💧");

    waterReminderInterval = setInterval(() => {
        showNotification("💧 Water Reminder", "Please drink water now.");
        speakText("Please drink water now.");
    }, 60 * 60 * 1000);
};

window.stopWaterReminder = function () {
    if (waterReminderInterval) {
        clearInterval(waterReminderInterval);
        waterReminderInterval = null;
        waterReminderStarted = false;
        alert("Water reminder stopped.");
    }
};

window.calculateBMI = function () {
    const height = Number(document.getElementById("heightInput").value);
    const weight = Number(document.getElementById("weightInput").value);
    const result = document.getElementById("bmiResult");

    if (height <= 0 || weight <= 0) {
        result.innerText = "Please enter valid height and weight.";
        return;
    }

    const heightMeter = height / 100;
    const bmi = weight / (heightMeter * heightMeter);

    let status = "";

    if (bmi < 18.5) status = "Underweight";
    else if (bmi < 25) status = "Healthy";
    else if (bmi < 30) status = "Overweight";
    else status = "Obese";

    result.innerText = "BMI: " + bmi.toFixed(1) + " - " + status;
};

window.addPrescriptionRecord = async function () {
    if (!currentUser) {
        alert("Please login first");
        return;
    }

    const doctor = document.getElementById("prescriptionDoctor").value.trim();
    const medicine = document.getElementById("prescriptionMedicine").value.trim();
    const date = document.getElementById("prescriptionDate").value;
    const notes = document.getElementById("prescriptionNotes").value.trim();

    if (doctor === "" || medicine === "" || date === "") {
        alert("Please enter doctor, medicine name and date");
        return;
    }

    await addDoc(collection(db, "users", currentUser.uid, "prescriptions"), {
        doctor,
        medicine,
        date,
        notes,
        createdAt: serverTimestamp()
    });

    document.getElementById("prescriptionDoctor").value = "";
    document.getElementById("prescriptionMedicine").value = "";
    document.getElementById("prescriptionDate").value = "";
    document.getElementById("prescriptionNotes").value = "";

    loadPrescriptions();

    alert("Prescription record saved ✅");
};

async function loadPrescriptions() {
    if (!currentUser) return;

    const list = document.getElementById("prescriptionList");
    if (!list) return;

    list.innerHTML = "";

    const q = query(
        collection(db, "users", currentUser.uid, "prescriptions"),
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        list.innerHTML = `<div class="medicine-card">No prescription records yet.</div>`;
        return;
    }

    snapshot.forEach(docSnap => {
        const p = docSnap.data();

        list.innerHTML += `
            <div class="medicine-card">
                <h3>📄 ${p.medicine}</h3>
                <p><b>Doctor:</b> ${p.doctor}</p>
                <p><b>Date:</b> ${p.date}</p>
                <p><b>Notes:</b> ${p.notes || "No notes"}</p>
            </div>
        `;
    });
}

window.downloadHealthReport = function () {
    if (!currentUserData) {
        alert("Please login first");
        return;
    }

    let taken = 0;
    let pending = 0;
    let missed = 0;

    medicines.forEach(medicine => {
        medicine.times.forEach(dose => {
            if (dose.taken) taken++;
            else if (dose.missed || isMissed(dose.time)) missed++;
            else pending++;
        });
    });

    let medicineRows = "";

    medicines.forEach(medicine => {
        medicineRows += `
            <tr>
                <td>${medicine.name}</td>
                <td>${medicine.category}</td>
                <td>${medicine.stock}</td>
                <td>${medicine.repeatDaily ? "Daily" : "One Time"}</td>
                <td>${medicine.familyMemberName || "Self"}</td>
                <td>${medicine.expiryDate || "-"}</td>
            </tr>
        `;
    });

    let appointmentRows = "";

    appointments.forEach(app => {
        appointmentRows += `
            <tr>
                <td>${app.doctor}</td>
                <td>${app.hospital || "-"}</td>
                <td>${app.date}</td>
                <td>${app.time}</td>
            </tr>
        `;
    });

    let doctorRows = "";

    doctors.forEach(doctor => {
        doctorRows += `
            <tr>
                <td>${doctor.name}</td>
                <td>${doctor.specialization}</td>
                <td>${doctor.contact}</td>
                <td>${doctor.hospital}</td>
            </tr>
        `;
    });

    let historyRows = "";

    historyItems.forEach(h => {
        historyRows += `
            <tr>
                <td>${h.medicineName}</td>
                <td>${h.time}</td>
                <td>${h.status}</td>
            </tr>
        `;
    });

    const reportWindow = window.open("", "_blank");

    reportWindow.document.write(`
        <html>
        <head>
            <title>MediCare Health Report</title>
            <style>
                body{font-family:Arial,sans-serif;padding:30px;color:#1f2937;}
                h1{color:#5b5ce2;text-align:center;}
                h2{margin-top:30px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;}
                .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:20px;}
                .card{background:#f5f7ff;padding:15px;border-radius:12px;text-align:center;font-weight:bold;}
                table{width:100%;border-collapse:collapse;margin-top:15px;}
                th,td{border:1px solid #d1d5db;padding:10px;text-align:left;}
                th{background:#eef2ff;}
                .footer{margin-top:40px;text-align:center;color:#6b7280;font-size:13px;}
                @media print{button{display:none;}}
            </style>
        </head>
        <body>
            <h1>💊 MediCare Health Report</h1>

            <p><b>Patient:</b> ${currentUserData.name}</p>
            <p><b>Email:</b> ${currentUserData.email}</p>
            <p><b>Generated On:</b> ${new Date().toLocaleString()}</p>

            <div class="summary">
                <div class="card">Taken: ${taken}</div>
                <div class="card">Pending: ${pending}</div>
                <div class="card">Missed: ${missed}</div>
            </div>

            <h2>Medicine List</h2>
            <table>
                <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Type</th>
                    <th>For</th>
                    <th>Expiry</th>
                </tr>
                ${medicineRows || "<tr><td colspan='6'>No medicines found</td></tr>"}
            </table>

            <h2>Appointments</h2>
            <table>
                <tr>
                    <th>Doctor</th>
                    <th>Hospital</th>
                    <th>Date</th>
                    <th>Time</th>
                </tr>
                ${appointmentRows || "<tr><td colspan='4'>No appointments found</td></tr>"}
            </table>

            <h2>Doctors</h2>
            <table>
                <tr>
                    <th>Name</th>
                    <th>Specialization</th>
                    <th>Contact</th>
                    <th>Hospital</th>
                </tr>
                ${doctorRows || "<tr><td colspan='4'>No doctors found</td></tr>"}
            </table>

            <h2>Medicine History</h2>
            <table>
                <tr>
                    <th>Medicine</th>
                    <th>Time</th>
                    <th>Status</th>
                </tr>
                ${historyRows || "<tr><td colspan='3'>No history found</td></tr>"}
            </table>

            <div class="footer">Generated by MediCare Reminder System</div>

            <br>
            <button onclick="window.print()">Download / Print PDF</button>
        </body>
        </html>
    `);

    reportWindow.document.close();
};

window.addFamilyMember = async function () {
    if (!currentUser) {
        alert("Please login first");
        return;
    }

    const name = document.getElementById("familyMemberName").value.trim();
    const relation = document.getElementById("familyMemberRelation").value.trim();

    if (name === "" || relation === "") {
        alert("Enter name and relation");
        return;
    }

    await addDoc(collection(db, "users", currentUser.uid, "familyMembers"), {
        name,
        relation,
        createdAt: serverTimestamp()
    });

    document.getElementById("familyMemberName").value = "";
    document.getElementById("familyMemberRelation").value = "";

    alert("Family member added ✅");
};

function listenFamilyMembers() {
    const q = query(
        collection(db, "users", currentUser.uid, "familyMembers"),
        orderBy("createdAt", "desc")
    );

    unsubscribeFamilyMembers = onSnapshot(q, snapshot => {
        familyMembers = [];

        snapshot.forEach(docSnap => {
            familyMembers.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        displayFamilyMembers();
        updateFamilyDropdown();
        updateStats();
        updateAnalytics();
    });
}

function displayFamilyMembers() {
    const list = document.getElementById("familyMemberList");
    if (!list) return;

    const search = document.getElementById("familySearch")?.value.toLowerCase() || "";

    let filtered = familyMembers.filter(member =>
        member.name.toLowerCase().includes(search) ||
        member.relation.toLowerCase().includes(search)
    );

    list.innerHTML = "";

    if (filtered.length === 0) {
        list.innerHTML = `<div class="medicine-card">No family members found.</div>`;
        return;
    }

    filtered.forEach(member => {
        list.innerHTML += `
            <div class="medicine-card">
                <h3>${member.name}</h3>
                <p>${member.relation}</p>

                <button class="delete-btn" onclick="deleteFamilyMember('${member.id}')">
                    Delete
                </button>
            </div>
        `;
    });
}

window.displayFamilyMembers = displayFamilyMembers;

function updateFamilyDropdown() {
    const select = document.getElementById("medicineFamilyMember");
    const filterDropdown = document.getElementById("medicineFilterMember");

    if (select) {
        select.innerHTML = `<option value="">👤 Self</option>`;

        familyMembers.forEach(member => {
            select.innerHTML += `
                <option value="${member.id}">
                    ${member.name} (${member.relation})
                </option>
            `;
        });
    }

    if (filterDropdown) {
        filterDropdown.innerHTML = `<option value="">All Members</option>`;

        familyMembers.forEach(member => {
            filterDropdown.innerHTML += `
                <option value="${member.id}">
                    ${member.name} (${member.relation})
                </option>
            `;
        });
    }
}

window.deleteFamilyMember = async function (memberId) {
    if (!confirm("Delete this family member?")) return;

    await deleteDoc(
        doc(db, "users", currentUser.uid, "familyMembers", memberId)
    );
};

window.saveEmergencyContact = function () {
    const name = document.getElementById("emergencyName").value.trim();
    const phone = document.getElementById("emergencyPhone").value.trim();

    if (name === "" || phone === "") {
        alert("Enter emergency contact name and phone");
        return;
    }

    localStorage.setItem("emergencyName", name);
    localStorage.setItem("emergencyPhone", phone);

    loadEmergencyContact();

    alert("Emergency Contact Saved ✅");
};

function loadEmergencyContact() {
    const box = document.getElementById("emergencyContactBox");
    if (!box) return;

    const name = localStorage.getItem("emergencyName");
    const phone = localStorage.getItem("emergencyPhone");

    if (!name || !phone) {
        box.innerHTML = `<div class="medicine-card">No emergency contact saved.</div>`;
        return;
    }

    box.innerHTML = `
        <div class="medicine-card">
            <h3>${name}</h3>
            <p>${phone}</p>
            <a href="tel:${phone}">Call Now</a>
        </div>
    `;
}

window.triggerSOS = function () {
    const emergencyName = localStorage.getItem("emergencyName") || "Emergency Contact";
    const emergencyPhone = localStorage.getItem("emergencyPhone") || "Not Set";

    const message =
        "EMERGENCY ALERT!\n\nPatient may need assistance.\n\nContact: " +
        emergencyName +
        "\nPhone: " +
        emergencyPhone;

    showNotification("🚨 Emergency SOS", message);

    const status = document.getElementById("sosStatus");

    if (status) {
        status.innerHTML =
            `<div class="medicine-card"><b>Emergency Alert Triggered!</b><br>${message.replace(/\n/g, "<br>")}</div>`;
    }

    alert(message);
};

window.addDoctor = async function () {
    if (!currentUser) {
        alert("Please login first");
        return;
    }

    const name = document.getElementById("doctorManageName").value.trim();
    const specialization = document.getElementById("doctorSpecialization").value.trim();
    const contact = document.getElementById("doctorContact").value.trim();
    const hospital = document.getElementById("doctorHospital").value.trim();

    if (name === "" || specialization === "" || contact === "" || hospital === "") {
        alert("Please fill all doctor details");
        return;
    }

    await addDoc(collection(db, "users", currentUser.uid, "doctors"), {
        name,
        specialization,
        contact,
        hospital,
        createdAt: serverTimestamp()
    });

    document.getElementById("doctorManageName").value = "";
    document.getElementById("doctorSpecialization").value = "";
    document.getElementById("doctorContact").value = "";
    document.getElementById("doctorHospital").value = "";

    alert("Doctor added successfully ✅");
};

function listenDoctors() {
    const q = query(
        collection(db, "users", currentUser.uid, "doctors"),
        orderBy("createdAt", "desc")
    );

    unsubscribeDoctors = onSnapshot(q, snapshot => {
        doctors = [];

        snapshot.forEach(docSnap => {
            doctors.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        displayDoctors();
        updateAnalytics();
    });
}

function displayDoctors() {
    const list = document.getElementById("doctorList");
    if (!list) return;

    list.innerHTML = "";

    if (doctors.length === 0) {
        list.innerHTML = `<div class="medicine-card">No doctors added yet.</div>`;
        return;
    }

    doctors.forEach(doctor => {
        list.innerHTML += `
            <div class="medicine-card">
                <h3>👨‍⚕ ${doctor.name}</h3>
                <p><b>Specialization:</b> ${doctor.specialization}</p>
                <p><b>Contact:</b> ${doctor.contact}</p>
                <p><b>Hospital:</b> ${doctor.hospital}</p>

                <a href="tel:${doctor.contact}">Call Doctor</a>

                <button class="delete-btn" onclick="deleteDoctor('${doctor.id}')">
                    Delete
                </button>
            </div>
        `;
    });
}

window.deleteDoctor = async function (doctorId) {
    if (!confirm("Delete this doctor?")) return;

    await deleteDoc(doc(db, "users", currentUser.uid, "doctors", doctorId));
};

function updateAnalytics() {
    let taken = 0;
    let missed = 0;
    let totalDoses = 0;

    medicines.forEach(medicine => {
        medicine.times.forEach(dose => {
            totalDoses++;

            if (dose.taken) taken++;
            if (dose.missed || isMissed(dose.time)) missed++;
        });
    });

    const adherence = totalDoses === 0
        ? 0
        : Math.round((taken / totalDoses) * 100);

    const adherenceBox = document.getElementById("adherencePercent");
    const missedBox = document.getElementById("missedThisWeek");
    const appointmentBox = document.getElementById("appointmentCount");
    const doctorBox = document.getElementById("doctorCount");

    if (adherenceBox) adherenceBox.innerText = adherence + "%";
    if (missedBox) missedBox.innerText = missed;
    if (appointmentBox) appointmentBox.innerText = appointments.length;
    if (doctorBox) doctorBox.innerText = doctors.length;

    updateFamilyStats();
}

function updateFamilyStats() {
    const box = document.getElementById("familyStatsBox");
    if (!box) return;

    box.innerHTML = "";

    const stats = {};

    medicines.forEach(medicine => {
        const member = medicine.familyMemberName || "Self";

        if (!stats[member]) {
            stats[member] = {
                total: 0,
                taken: 0,
                missed: 0
            };
        }

        medicine.times.forEach(dose => {
            stats[member].total++;

            if (dose.taken) stats[member].taken++;
            if (dose.missed || isMissed(dose.time)) stats[member].missed++;
        });
    });

    const members = Object.keys(stats);

    if (members.length === 0) {
        box.innerHTML = `<div class="medicine-card">No family statistics yet.</div>`;
        return;
    }

    members.forEach(member => {
        const s = stats[member];
        const percent = s.total === 0
            ? 0
            : Math.round((s.taken / s.total) * 100);

        box.innerHTML += `
            <div class="medicine-card">
                <h3>${member}</h3>
                <p><b>Total Doses:</b> ${s.total}</p>
                <p><b>Taken:</b> ${s.taken}</p>
                <p><b>Missed:</b> ${s.missed}</p>
                <p><b>Adherence:</b> ${percent}%</p>
            </div>
        `;
    });
}

window.saveGeminiKey = function () {
    const key = document.getElementById("geminiInput").value.trim();
    if (key === "") {
        alert("Please enter a valid Gemini API Key.");
        return;
    }
    localStorage.setItem("userGeminiKey", key);
    GEMINI_API_KEY = key;
    alert("Gemini API Key saved securely in your browser! ✅");
};

window.askHealthAI = async function () {
    const question = document.getElementById("aiQuestion").value.trim();
    const answerBox = document.getElementById("aiAnswer");
    const activeKey = localStorage.getItem("userGeminiKey") || GEMINI_API_KEY;

    if (question === "") {
        answerBox.innerHTML = "Please enter a question.";
        return;
    }

    if (!activeKey || activeKey === "YOUR_GEMINI_API_KEY" || activeKey === "") {
        answerBox.innerHTML = "⚠️ <b>API Key Required:</b> Please enter and save your Gemini API Key in the box above to activate the AI Assistant.";
        return;
    }

    answerBox.innerHTML = "🤖 Thinking...";

    const medicineSummary = medicines.map(m => {
        return `${m.name}, ${m.category}, stock ${m.stock}, for ${m.familyMemberName || "Self"}, expiry ${m.expiryDate || "not set"}`;
    }).join("\n");

    const appointmentSummary = appointments.map(a => {
        return `${a.doctor} at ${a.hospital || "hospital"} on ${a.date} ${a.time}`;
    }).join("\n");

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `
You are MediCare AI Health Assistant.

Use this user's app data if helpful.

Medicines:
${medicineSummary || "No medicines added"}

Appointments:
${appointmentSummary || "No appointments added"}

Doctors:
${doctors.map(d => `${d.name}, ${d.specialization}, ${d.hospital}`).join("\n") || "No doctors added"}

Rules:
- Give clear, simple health guidance.
- Do not diagnose diseases.
- Do not prescribe medicine dosage.
- If serious symptoms are mentioned, advise doctor/emergency care.
- For medicine questions, say to follow doctor prescription or medicine label.
- Keep answer short and useful.

User question:
${question}
`
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 400
                    }
                })
            }
        );
        const data = await response.json();
console.log(data);


        if (!response.ok) {
            answerBox.innerHTML =
                "❌ AI Error: " + (data.error?.message || "Request failed");
            return;
        }

        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "No response received.";

        answerBox.innerHTML = text.replace(/\n/g, "<br>");
    } catch (error) {
        answerBox.innerHTML =
            "❌ Error contacting AI assistant: " + error.message;
    }
};

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}

window.showPage = function (pageId) {
    const pages = document.querySelectorAll(".page-section");

    pages.forEach(page => {
        page.classList.add("hidden");
    });

    const activePage = document.getElementById(pageId);

    if (activePage) {
        activePage.classList.remove("hidden");
    }

    if (pageId === "aiPage") {
        const geminiInput = document.getElementById("geminiInput");
        if (geminiInput) {
            geminiInput.value = localStorage.getItem("userGeminiKey") || "";
        }
    }
};

window.startVoiceAssistant = function () {
    alert("Voice button clicked ✅");

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    const voiceBox = document.getElementById("voiceText");

    if (!voiceBox) {
        alert("voiceText not found in HTML");
        return;
    }

    if (!SpeechRecognition) {
        voiceBox.innerText = "Voice recognition not supported. Use Google Chrome.";
        alert("Voice recognition not supported. Use Google Chrome.");
        return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceBox.innerText = "🎤 Listening... Speak now.";

    recognition.start();

    recognition.onresult = function (event) {
        const command = event.results[0][0].transcript.toLowerCase();

        voiceBox.innerText = "You said: " + command;

        fillMedicineFromVoice(command);
    };

    recognition.onerror = function (event) {
        voiceBox.innerText = "Voice error: " + event.error;
        alert("Voice error: " + event.error);
    };
};

function fillMedicineFromVoice(command) {
    let medicineName = "";
    let timeValue = "";

    let cleaned = command
        .replace("add", "")
        .replace("medicine", "")
        .replace("tablet", "")
        .replace("capsule", "")
        .replace("syrup", "")
        .trim();

    const timeMatch = cleaned.match(/at\s+(.+)/);

    if (timeMatch) {
        medicineName = cleaned.split("at")[0].trim();
        timeValue = convertVoiceTimeTo24Hour(timeMatch[1].trim());
    } else {
        medicineName = cleaned.trim();
    }

    if (medicineName !== "") {
        document.getElementById("medicineName").value =
            capitalizeWords(medicineName);
    }

    if (command.includes("syrup")) {
        document.getElementById("medicineCategory").value = "Syrup";
    } else if (command.includes("injection")) {
        document.getElementById("medicineCategory").value = "Injection";
    } else if (command.includes("drops")) {
        document.getElementById("medicineCategory").value = "Drops";
    } else {
        document.getElementById("medicineCategory").value = "Tablet";
    }

    if (timeValue !== "") {
        document.getElementById("timeInputs").innerHTML =
            `<input type="time" class="medicineTime" value="${timeValue}">`;
    }

    const stockMatch = command.match(/stock\s+(\d+)/);

    if (stockMatch) {
        document.getElementById("medicineStock").value = stockMatch[1];
    }

    alert("Medicine form filled from voice ✅");
}

function convertVoiceTimeTo24Hour(timeText) {
    timeText = timeText
        .replace(".", "")
        .replace("a m", "am")
        .replace("p m", "pm")
        .replace("a.m", "am")
        .replace("p.m", "pm")
        .trim();

    let hour = 0;
    let minute = 0;

    const hasPM =
        timeText.includes("pm") ||
        timeText.includes("evening") ||
        timeText.includes("night");

    const hasAM =
        timeText.includes("am") ||
        timeText.includes("morning");

    timeText = timeText
        .replace("am", "")
        .replace("pm", "")
        .replace("morning", "")
        .replace("evening", "")
        .replace("night", "")
        .trim();

    const numberMatch = timeText.match(/\d+/g);

    if (!numberMatch) {
        return "";
    }

    hour = Number(numberMatch[0]);

    if (numberMatch.length > 1) {
        minute = Number(numberMatch[1]);
    }

    if (hasPM && hour < 12) {
        hour += 12;
    }

    if (hasAM && hour === 12) {
        hour = 0;
    }

    return (
        hour.toString().padStart(2, "0") +
        ":" +
        minute.toString().padStart(2, "0")
    );
}

function capitalizeWords(text) {
    return text.replace(/\b\w/g, char => char.toUpperCase());
}