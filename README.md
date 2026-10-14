# 💊 MediCare – Smart Medicine Reminder & Health Assistant

**MediCare** is a modern, responsive Progressive Web Application (PWA) designed to help patients, families, and caregivers track medication schedules, doctor appointments, health statistics, and emergency alerts. Powered by **Firebase Authentication**, **Cloud Firestore**, **Firebase Storage**, **Firebase Cloud Functions**, and **Google Gemini AI**.

---

## 🚀 Architectural Setup & Local Execution

### 1. Running the Frontend Locally

Since this app uses HTML, CSS, and ES Modules (`script.js`), it **must** be served via a local web server (browser security rules block ES module imports on direct `file://` access).

To run locally in your terminal:

```powershell
npx serve .
```

*or with Python:*

```powershell
python -m http.server 8000
```

Open `http://localhost:3000` (or `http://localhost:8000`) in Google Chrome / modern web browser.

---

## 🔑 Environment Variables & Secrets Setup

> 🔒 **Security Requirement**: The Gemini API key is kept strictly **server-side only** inside Cloud Functions (`functions/index.js`). **NEVER** put the key in any client-side file.

### Local Development Setup (Firebase Emulator):
1. Create a local secret file inside the `functions/` directory named `functions/.secret.local`:
   ```bash
   # functions/.secret.local
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Note: `functions/.secret.local` is listed in `.gitignore` so your API key will never be committed to source control).*
2. Start the Firebase Functions emulator:
   ```bash
   firebase emulators:start --only functions
   ```
3. When running on `localhost` or `127.0.0.1`, `script.js` automatically connects to the local emulator via `connectFunctionsEmulator(functions, "localhost", 5001)`.

### Production Deployment Setup:
1. Set the production secret in Firebase Secret Manager:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```
   *(Enter your Gemini API key when prompted).*
2. Deploy functions to production:
   ```bash
   firebase deploy --only functions
   ```


## 🛡️ Firestore Security Rules & Patient Approval Flow

Deploy the included `firestore.rules` file to restrict data access:

- **User Isolation**: Users can read/write only their own documents and subcollections (`medicines`, `appointments`, `history`, `familyMembers`, `doctors`, `prescriptions`, `caregiverAlerts`, `caregiverRequests`, `authorizedCaregivers`).
- **Patient Approval Caregiver Access**: Caregivers can read patient data ONLY if authorized by the patient (`authorizedCaregivers/{caregiverId}` with `status == "approved"`).
- **Patient Approval Workflow**:
  1. Patient shares caregiver code (`CG-ABC123`).
  2. Caregiver requests link (`caregiverRequests/{caregiverId}`).
  3. Patient approves request -> adds caregiver to `authorizedCaregivers` with `approved` status.

To deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## ☁️ Deploying Cloud Functions & Firebase Hosting

### 1. Install Dependencies & Build Backend Functions:
```bash
cd functions
npm install
cd ..
```

### 2. Deploy Everything to Production:
```bash
firebase deploy
```

*or deploy selectively:*
```bash
firebase deploy --only hosting
firebase deploy --only functions
```

---

## 🛠 Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System & Dark Mode), JavaScript (ES Modules).
- **Backend & Database**: Firebase Authentication, Cloud Firestore (Realtime NoSQL Database).
- **AI & ML**: Google Gemini API (`gemini-3.6-flash`) for automated healthcare assistance.
- **PWA**: Web App Manifest & Cache API Service Worker.

---

## 📋 Comprehensive Testing Checklist

### Phase 1: Reliability & Security
- [x] **PWA Installability**: Install app icon directly from browser bar; offline shell cached via `sw.js`.
- [x] **Firebase Cloud Messaging (FCM)**: Push notification permission request and foreground/background push dispatch for medicines and appointments with daily repeat support.
- [x] **Emergency SOS**: Emergency SOS broadcast sends real-time alert document, triggers caregiver FCM push, and optional Twilio SMS fallback.
- [x] **Gemini API Backend Proxy**: `askGemini` Cloud Function handles AI queries securely off the browser with key kept in environment secrets.
- [x] **Firestore Security Rules & Patient Approval**: Strictly scoped rules requiring explicit patient approval before granting caregiver data access.

### Phase 2: UI/UX Redesign
- [x] **Authentication Tabs**: Separate Login and Sign Up tabs with primary buttons, loading state, show/hide password toggle, and friendly inline errors.
- [x] **Non-blocking Toasts**: All `alert()` calls replaced with non-blocking toast notifications.
- [x] **Dashboard Cards**: Circular SVG progress ring, Next dose countdown timer, adherence streak counter, low-stock warnings.
- [x] **Navigation**: Fixed desktop sidebar with persistent logout, mobile bottom navigation tab bar.
- [x] **Dark Mode**: Header theme toggle icon (☀️/🌙) with persistent preference saving in `localStorage` & user profile.
- [x] **Accessible Forms & Modals**: Input labels, Relation dropdown, custom confirmation modal for delete/edit actions.
- [x] **Empty States & Skeletons**: Empty state cards for all list views and skeleton pulse loaders.

### Phase 3: Features
- [x] **Medicines**: Dosage, food timing, frequency, notes, "Mark Taken / Skip / Snooze" actions, low-stock warnings.
- [x] **Analytics**: Chart.js charts for weekly adherence trend and missed doses overview with per-family-member statistics.
- [x] **AI Assistant**: Real-time chat interface with Firestore message history (`aiChats`), disclaimer banner, emergency query guardrails.
- [x] **Health Tools**: BMI calculator with category badges (`Underweight`, `Normal`, `Overweight`, `Obese`), prescription image/PDF upload archive (Firebase Storage + base64 fallback), water intake reminder.
- [x] **Health Report**: Clean printable / PDF export report window with complete patient medication profile.
- [x] **Notification Center**: Past alerts log with date filters (All Time, Today, Past 7 Days).

---

## 💰 Google Cloud Budget Alert Recommendation

To prevent unexpected billing spikes on the Firebase Blaze Plan when using Cloud Functions and Gemini API:

1. Open the **[Google Cloud Billing Console](https://console.cloud.google.com/billing)**.
2. Select **Budgets & alerts** -> **Create Budget**.
3. Set a monthly target budget (e.g., `$5.00` or `$10.00`).
4. Configure email alerts at **50%**, **80%**, and **100%** threshold triggers.

---

## 🛡️ Firebase App Check Setup (Optional Hardening)

Firebase App Check protects your backend resources (Cloud Functions, Firestore, Storage) from abuse, unauthorized API calls, and scraping by verifying that incoming requests originate from your legitimate application.

### Important Notice Before Enabling:
> ⚠️ **What App Check Will Break if Enabled Without Provider Setup**: Enabling App Check in **Enforcement Mode** without proper token provider configuration will **block all local testing, development environments (`localhost`), and unauthorized browsers** from reaching Cloud Functions, Firestore, or Storage.

### Setup Steps:
1. **Register Provider**:
   - In Firebase Console -> **App Check**, register your web app with **reCAPTCHA v3** (or reCAPTCHA Enterprise).
2. **Client-Side Initialization**:
   Add App Check initialization to `script.js` before `initializeApp`:
   ```javascript
   import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-appcheck.js";

   const appCheck = initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_V3_SITE_KEY'),
     isTokenAutoRefreshEnabled: true
   });
   ```
3. **Local Testing**:
   For local development, enable debug tokens in browser console:
   ```javascript
   self.FIREBASE_APPCHECK_EXECUTION_TIME = true;
   ```
   Add the generated debug token in Firebase Console under **App Check -> Apps -> Manage Debug Tokens**.
>>>>>>> adb239b (Enhance MediCare application with Firebase backend, security rules, Cloud Functions, and test suites)

---

## 📄 License
This project is open-source and available under the **MIT License**.

