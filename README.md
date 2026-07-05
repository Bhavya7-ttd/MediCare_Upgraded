# 💊 MediCare - Smart Medicine Reminder & AI Health Assistant

MediCare is a modern, responsive Progressive Web Application (PWA) designed to help patients, families, and caregivers manage medication schedules, doctor appointments, health statistics, and emergency alerts. Powered by **Firebase Authentication**, **Cloud Firestore**, and **Google Gemini AI**, MediCare provides intelligent healthcare assistance with real-time medication tracking and adherence monitoring.

---

# 🚀 Live Demo

🔗 **https://medi-care-upgraded.vercel.app/**

---

# ✨ Features

## 🔐 Secure Authentication
- Firebase Email & Password Authentication
- Persistent Login Sessions
- Secure User Management

## 🏠 Interactive Dashboard
- Real-time medicine statistics
- Weekly adherence tracking
- Upcoming medicine reminders
- Low stock alerts

## 👨‍👩‍👧 Family Member Management
- Manage medicines for multiple family members
- Individual adherence tracking
- Elderly & caregiver support

## 💊 Smart Medicine Management
- Multiple daily medicine schedules
- Repeat reminders
- One-click **Mark as Taken**
- Snooze reminders
- Low stock notifications
- Expiry date monitoring

## 🎤 Voice Assistant
Add medicines using natural voice commands such as:

> "Add Dolo 650 at 8 PM with stock 15"

---

## 📅 Doctor Appointment Management
- Schedule appointments
- Upcoming appointment reminders

---

## 🏥 Doctor & Hospital Directory
- Save doctor information
- Store hospital details
- One-click calling support

---

## 🚨 Emergency SOS & Caregiver Portal
- Emergency SOS button
- Caregiver Code system
- Real-time adherence monitoring
- Missed medicine tracking

---

## 🩺 Health Tools
- Hourly Water Reminder
- BMI Calculator
- Prescription Record Storage

---

## 🤖 AI Health Assistant

Powered by **Google Gemini AI**, the assistant can help users with:

- Medicine timing guidance
- General health-related questions
- Wellness suggestions
- Medication information

> **Note:** Users provide their own Gemini API Key, which is securely stored in the browser's local storage.

---

## 📊 Health Reports
Generate downloadable PDF reports containing:

- Medicine history
- Adherence statistics
- Doctor appointments
- Health records

---

## 🌙 Dark Mode
- Eye-friendly interface
- Persistent theme preference

---

## 📱 Progressive Web App (PWA)

- Installable on Desktop
- Installable on Mobile
- Offline caching using Service Worker
- Fast loading experience

---

# 🚀 Deployment

## Live Website

https://medi-care-upgraded.vercel.app/

---

# ⚙️ Setup

## 1️⃣ Configure Firebase

Open **script.js** and update your Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "your-app.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};
```

You can obtain these credentials from the Firebase Console.

---

## 2️⃣ Gemini API

The application stores the Gemini API Key in the user's browser.

```javascript
let GEMINI_API_KEY = localStorage.getItem("userGeminiKey") || "";
```

Users can generate their own API key from **Google AI Studio** and enter it inside the application.

---

# 🌐 Deploy on Vercel

1. Push the project to GitHub.

```bash
git init
git add .
git commit -m "Initial Commit"
git branch -M main
git remote add origin https://github.com/yourusername/yourrepository.git
git push -u origin main
```

2. Visit

https://vercel.com

3. Import your GitHub repository.

4. Select **Application Preset → Other**.

5. Click **Deploy**.

Your application will be live within a few minutes.

---

# 🔥 Deploy on Firebase Hosting (Optional)

Install Firebase CLI

```bash
npm install -g firebase-tools
```

Login

```bash
firebase login
```

Deploy

```bash
firebase deploy --only hosting
```

---

# 🛠️ Tech Stack

### Frontend
- HTML5
- CSS3
- JavaScript (ES6)

### Backend & Database
- Firebase Authentication
- Cloud Firestore

### AI
- Google Gemini API

### Deployment
- Vercel

### Progressive Web App
- Service Worker
- Web App Manifest

---

# 📂 Project Structure

```
MediCare_Upgraded/
│── index.html
│── style.css
│── script.js
│── manifest.json
│── firebase.json
│── sw.js
│── icons/
│── README.md
```

---

# 📄 License

This project is open-source and available under the **MIT License**.

Made with ❤️ to simplify medication management and improve healthcare accessibility.
