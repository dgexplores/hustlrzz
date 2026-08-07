# Google Authentication Setup Guide

This guide will help you set up Google Authentication for the Mocker Flutter Web app.

## Prerequisites

- A Google account
- Access to Google Cloud Console
- Firebase project already created

## Step 0: Get Firebase Configuration (IMPORTANT)

### 0.1 Get Firebase Web App Config
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `hustlrzz`
3. Click the **gear icon** (Settings) → **Project settings**
4. Scroll down to **Your apps** section
5. If you don't have a web app, click **Add app** → Web (</>) icon
6. Register your app with nickname "Mocker Web"
7. Copy the **Firebase SDK configuration**

You'll see something like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAxxxxxxxxxxxxx",
  authDomain: "hustlrzz.firebaseapp.com",
  projectId: "hustlrzz",
  storageBucket: "hustlrzz.firebasestorage.app",
  messagingSenderId: "3469018xxxxx",
  appId: "1:3469xxxx2089:web:4462xxxxxb9d5a8",
  measurementId: "G-RY4QxxxxD6"
};
```

### 0.2 Put the config in `dart_defines.env` (not in source code)

Firebase config values are injected at build time so **no API keys are committed**
to the repository. Create the local config file and fill in the values you got
above:

```bash
cp dart_defines.env.example dart_defines.env
```

Your `dart_defines.env` should look like (with real values):

```
FIREBASE_API_KEY=AIzaSyAxxxxxxxxxxxxx            # from firebaseConfig.apiKey
FIREBASE_APP_ID=1:3469xxxx2089:web:4462xxxxxb9d5a8
FIREBASE_MESSAGING_SENDER_ID=3469018xxxxx
FIREBASE_PROJECT_ID=hustlrzz
FIREBASE_AUTH_DOMAIN=hustlrzz.firebaseapp.com
FIREBASE_STORAGE_BUCKET=hustlrzz.firebasestorage.app
FIREBASE_MEASUREMENT_ID=G-RY4QxxxxD6
```

This file is gitignored, so it never gets pushed. **Always run/build with:**

```bash
flutter run -d chrome --web-port=3000 --dart-define-from-file=dart_defines.env
```

> **Security note:** the old web API key was hardcoded in `lib/firebase_options.dart`
> and may already be in public git history. If so, **rotate the key** (or at
> minimum restrict it) in Google Cloud Console, and consider adding Firebase
> App Check. Restricting the key by HTTP referrer is the real fix — just make
> sure your dev/deployed origins are allowed, or sign-in will fail.

## Step 1: Enable Google APIs

### 1.1 Open Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `hustlrzz`

### 1.2 Enable Required APIs
Navigate to **APIs & Services** → **Library** and enable:
- **Google Sign-In API**
- **People API** (Required for user profile data)

Or use these direct links:
- [Enable Google Sign-In API](https://console.developers.google.com/apis/api/plus.googleapis.com)
- [Enable People API](https://console.developers.google.com/apis/api/people.googleapis.com)

## Step 2: Create OAuth 2.0 Credentials

### 2.1 Create Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Select **Web application**
4. Name: `Mocker Web App`

### 2.2 Configure Authorized Origins
Add these URLs to **Authorized JavaScript origins**:
- `http://localhost:3000` (for development)
- `http://localhost:8080` (Flutter default)
- `https://your-domain.com` (for production)

### 2.3 Configure Redirect URIs
Add these URLs to **Authorized redirect URIs**:
- `http://localhost:3000`
- `http://localhost:8080`
- `https://your-domain.com` (for production)

### 2.4 Save and Copy Client ID
After creation, you'll see your **Client ID**. It looks like:
```
34xxxxxxx12xx9-xxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

**⚠️ Important: This Client ID needs to be used in two places:**
1. `web/index.html` file
2. `lib/services/auth_service.dart` file

### 2.5 Find Your Existing Client ID (If Already Created)
If you already have a project, you can find the Client ID like this:
1. In Firebase Console → Authentication → Sign-in method → Google
2. Expand the Google provider
3. Copy the Client ID from **Web SDK configuration**

Or check existing OAuth 2.0 Client IDs in Google Cloud Console → APIs & Services → Credentials.

## Step 3: Configure Firebase Authentication

### 3.1 Enable Google Sign-In
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `hustlrzz`
3. Go to **Authentication** → **Sign-in method**
4. Enable **Google**
5. Enter your **Web SDK configuration** (Client ID from Step 2.4)
6. Save

## Step 4: Update Flutter App Configuration

### 4.1 Update index.html
Add this meta tag to `web/index.html` in the `<head>` section:
```html
<meta name="google-signin-client_id" content="YOUR_CLIENT_ID_HERE">
```

### 4.2 Update AuthService
In `lib/services/auth_service.dart`, update the GoogleSignIn configuration:
```dart
final GoogleSignIn _googleSignIn = GoogleSignIn(
  clientId: 'YOUR_CLIENT_ID_HERE',
  scopes: ['email', 'profile'],
);
```

Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID from Step 2.4.

## Step 5: Test the Setup

### 5.1 Run the App
```bash
flutter run -d chrome --web-port=3000
```

### 5.2 Test Login Flow
1. Click "Sign in with Google"
2. Complete Google OAuth flow
3. Verify user is logged in
4. Test logout functionality

## Step 5: Troubleshooting "authentication error" when clicking Google

Almost all Google sign-in failures are Google Cloud / Firebase **console
configuration**, not app code. Work through this checklist in order:

### 5.1 The OAuth client must be a **Web application** client
In Google Cloud Console → **APIs & Services → Credentials**, the client ID used
in `lib/services/auth_service.dart` (and `web/index.html`) must be an OAuth
client of type **Web application**. If you accidentally copied an *Android* or
*iOS* client ID, sign-in fails with an `invalid_client` / token error.

### 5.2 Authorized JavaScript origins must include the exact URL you're on
In the same OAuth client, under **Authorized JavaScript origins** (and
**Authorized redirect URIs**) add the **exact** origin you are testing from:

- `http://localhost:3000` (or whatever port — `--web-port` controls it; if you
  omit it, Flutter picks a random port and you must update the origins again!)
- `https://hustlrzz.vercel.app` (your deployed domain, if applicable)

A missing/mismatched origin shows errors like `idpiframe_initialization_failed`,
`redirect_uri_mismatch`, `invalid_request`, or `Origin ... is not allowed`.

### 5.3 Google provider must be enabled in Firebase
Firebase console → **Authentication → Sign-in method → Google** → Enable.
Otherwise you get `auth/operation-not-allowed`.

### 5.4 The Firebase API key must not be restricted away
If you restricted the web API key (recommended!) make sure the **HTTP referrer
restrictions** in Google Cloud Console include your dev and production origins.
Over-restriction causes `auth/api-key-not-valid` or CORS errors that look like
"authentication error".

### 5.5 Client ID must match everywhere
`web/index.html` meta tag, `lib/services/auth_service.dart`, and the Web SDK
config in Firebase Console (Authentication → Google provider) must all use the
**same** client ID.

### 5.6 People API must be enabled (error: `403 SERVICE_DISABLED`)
If Google sign-in fails with an error like:
```
People API has not been used in project ... before or it is disabled.
```
then the **People API** is not enabled on the Google Cloud project. The
google_sign_in plugin calls it to fetch your name/photo after the popup.

Fix: open this link (uses your project ID) and click **Enable**:
`https://console.developers.google.com/apis/api/people.googleapis.com/overview`

Then wait 1–3 minutes for it to propagate and retry sign-in.

### 5.7 Popups / cookies
Allow popups and third-party cookies for the site, or the sign-in popup may
close instantly with `popup-closed-by-user`.

If it still fails, the app now shows the underlying error code on the login
page (e.g. `invalid-credential`, `operation-not-allowed`) — search that code.

## Production Deployment

When deploying to production:

1. Add your production domain to OAuth configuration
2. Set the `FIREBASE_*` environment variables in your CI/CD provider (the
   `deploy.sh` script reads them automatically)
3. Ensure HTTPS is enabled
4. Test the complete authentication flow

---

For more information, refer to:
- [Google Sign-In for Web](https://developers.google.com/identity/sign-in/web)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Flutter Google Sign-In Plugin](https://pub.dev/packages/google_sign_in) 