# Firebase Setup Instructions

To enable Google sign-in and cloud sync for your Bible reading plan, you need to set up a Firebase project.

## Steps:

1. **Create a Firebase Project**
   - Go to https://console.firebase.google.com/
   - Click "Add project" or select an existing project
   - Follow the setup wizard

2. **Enable Authentication**
   - In Firebase Console, go to "Authentication" → "Sign-in method"
   - Click "Google" and enable it
   - Add your domain to authorized domains if needed

3. **Create Firestore Database**
   - Go to "Firestore Database" in Firebase Console
   - Click "Create database"
   - Start in "test mode" (you can secure it later with rules)
   - Choose a location for your database

4. **Get Your Firebase Config**
   - Go to Project Settings (gear icon) → "General" tab
   - Scroll down to "Your apps" section
   - Click the web icon (`</>`) to add a web app
   - Register your app (you can name it "MyBiblePlan")
   - Copy the `firebaseConfig` object

5. **Update index.html**
   - Open `index.html`
   - Find the `firebaseConfig` object (around line 30)
   - Replace the placeholder values with your actual Firebase config:
     ```javascript
     const firebaseConfig = {
         apiKey: "YOUR_ACTUAL_API_KEY",
         authDomain: "your-project-id.firebaseapp.com",
         projectId: "your-project-id",
         storageBucket: "your-project-id.appspot.com",
         messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
         appId: "YOUR_APP_ID"
     };
     ```

6. **Set Firestore Security Rules (Optional but Recommended)**
   - Go to Firestore Database → Rules
   - Update rules to allow users to read/write only their own data:
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{userId} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
         }
       }
     }
     ```

7. **Test It**
   - Open your website
   - Click the user icon (👤) in the top right
   - Sign in with Google
   - Mark a day as complete
   - Check Firestore Console → Firestore Database → users collection to see your data

## How It Works:

- **When logged out**: Progress is saved to localStorage (works offline, but only on one device)
- **When logged in**: Progress is synced to Firestore (works across all devices)
- **Real-time sync**: If you have the app open on multiple devices, changes sync automatically

## Troubleshooting:

- **"Firebase not available"**: Make sure you've updated the config in index.html
- **Sign-in fails**: Check that Google authentication is enabled in Firebase Console
- **Data not syncing**: Check browser console for errors, verify Firestore rules allow access
