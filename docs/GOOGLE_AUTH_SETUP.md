# Google authentication setup

The application code uses Supabase Auth with the PKCE flow and completes sign-in at `/auth/callback`. The provider still needs one-time credentials in Google Cloud and Supabase.

## 1. Configure Google Cloud

1. Open **Google Cloud Console → APIs & Services → OAuth consent screen**.
2. Create an external app, add the Hustlrzz product name and support email, then add your own Google account as a test user while the app is in testing.
3. Open **Credentials → Create credentials → OAuth client ID → Web application**.
4. Copy the Supabase callback shown under **Supabase Dashboard → Authentication → Providers → Google** into **Authorized redirect URIs**. It has this form:

   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

5. Save the Google client ID and client secret.

## 2. Configure Supabase

1. Open **Authentication → Providers → Google**.
2. Enable Google and paste the Google client ID and client secret.
3. Open **Authentication → URL Configuration**.
4. Set **Site URL** to the stable Vercel production URL.
5. Add these **Redirect URLs**:

   - `https://YOUR_PRODUCTION_DOMAIN/auth/callback`
   - `https://YOUR_PRODUCTION_DOMAIN/**`
   - `http://localhost:3000/auth/callback`

Use the stable Vercel domain, not a commit-specific preview URL. Add a preview wildcard only if Google sign-in is intentionally supported in previews.

## 3. Verify

1. Open a protected page such as `/prepare` in a private browser window.
2. Select **Continue with Google** and choose an account.
3. Confirm that Google returns to `/auth/callback` and the app forwards to `/prepare`.
4. Check **Supabase → Authentication → Users** for the Google identity.

If the app reports that the provider is not enabled, complete step 2. If Google reports `redirect_uri_mismatch`, the URI in Google Cloud does not exactly match the Supabase callback shown in the provider settings.
