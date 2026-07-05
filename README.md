# 💊 MediCare - Smart Medicine Reminder & Health Assistant

**MediCare** is a modern, responsive Progressive Web Application (PWA) designed to help patients, families, and caregivers track medication schedules, doctor appointments, health statistics, and emergency alerts. Connected with **Firebase Authentication**, **Cloud Firestore**, and **Google Gemini AI**, MediCare provides real-time adherence tracking and intelligent healthcare assistance.

---

## ✨ Features

- 🔐 **Firebase Authentication**: Secure email & password signup/login with persistent user sessions.
- 🏠 **Interactive Dashboard**: Real-time progress bars, upcoming dose indicators, low stock alerts, and weekly adherence charts.
- 👨‍👩‍👧 **Family Member Management**: Track medications and adherence statistics independently for parents, children, or elderly family members.
- 💊 **Smart Medicine Management**:
  - Multi-time daily dose scheduling with repeat options.
  - One-click dose recording ("Mark Taken") and snooze functionality.
  - Automatic low-stock warnings and easy refill prompts.
  - Expiry date tracking (active warnings for expiring/expired medicines).
- 🎤 **Voice Assistant**: Hands-free medicine input using natural speech (e.g., *"Add Dolo 650 at 8 PM stock 15"*).
- 📅 **Doctor Appointments**: Schedule and receive timely alerts for upcoming consultations.
- 🏥 **Doctor & Hospital Directory**: Save doctor contact numbers, specializations, and call directly from the app.
- 🚨 **Emergency SOS & Caregiver Portal**:
  - One-click Emergency SOS alert broadcasting to saved contacts.
  - Unique **Caregiver Code** system allowing remote family members or nurses to monitor patient adherence and missed doses in real time.
- 🩺 **Health Tools**:
  - Hourly water reminder notifications.
  - Built-in BMI Calculator with health status indicators.
  - Prescription record archiving.
- 🤖 **AI Health Assistant**: Integrated with Google Gemini AI to answer general health queries, medicine timing advice, and wellness tips based on the user's active prescriptions.
- 📊 **Downloadable Health Reports**: Export comprehensive medical history, adherence charts, and doctor appointments as a clean, printable PDF report.
- 🌙 **Dark Mode**: Smooth, eye-friendly dark theme with persistent preference saving.
- 📱 **Progressive Web App (PWA)**: Fully installable on desktop and mobile devices with Service Worker offline caching.

---

## 🚀 Setup & Configuration (Important before deploying!)

Before deploying this project to **GitHub Pages**, **Firebase Hosting**, or running locally, you must configure your API keys in `script.js`.

### 1. Configure Firebase & Gemini API Keys
Open `script.js` and locate lines 32–41:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "your-app.firebaseapp.com",
    projectId: "your-app-id",
    storageBucket: "your-app.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
```

Replace `"YOUR_FIREBASE_API_KEY"` and the other Firebase configuration values with your actual project credentials from the [Firebase Console](https://console.firebase.google.com/).
Replace `"YOUR_GEMINI_API_KEY"` with your Google AI Studio Gemini API key.

---

## 🌐 How to Deploy on GitHub Pages

This application is built with vanilla HTML, CSS, and ES Modules, making it 100% compatible with GitHub Pages without any build steps!

1. **Push your repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - MediCare PWA"
   git branch -M main
   git remote add origin https://github.com/yourusername/your-repo-name.git
   git push -u origin main
   ```
2. **Enable GitHub Pages**:
   - Go to your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment** → **Source**, select `Deploy from a branch`.
   - Choose the `main` branch and `/ (root)` folder, then click **Save**.
3. **Visit your live PWA**:
   - Within a couple of minutes, your site will be live at `https://yourusername.github.io/your-repo-name/`.

> **Note on Relative Paths**: All links and script imports in this project use relative paths (`./style.css`, `./script.js`, `./manifest.json`), ensuring seamless execution on GitHub Pages subdirectories!

---

##  🔥 How to Deploy on Firebase Hosting

If you prefer deploying via Firebase Hosting:

1. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Login and initialize (if not already initialized):
   ```bash
   firebase login
   firebase use default
   ```
3. Deploy to production:
   ```bash
   firebase deploy --only hosting
   ```

---

## 🛠 Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System & Dark Mode), JavaScript (ES Modules).
- **Backend & Database**: Firebase Authentication, Cloud Firestore (Realtime NoSQL Database).
- **AI & ML**: Google Gemini API (`gemini-2.5-flash`) for automated healthcare assistance.
- **PWA**: Web App Manifest & Cache API Service Worker.

---

## 📄 License
This project is open-source and available under the MIT License. Made with ❤️ for better healthcare management.
