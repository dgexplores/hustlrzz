# Authentication email modes

## Current demo mode

The hosted configuration uses `enable_confirmations = false`, so email/password
signup creates a session immediately. This keeps the application usable without
an SMTP provider or a verified sender domain.

## Enable verified email later

1. Add and verify a custom sender domain in Resend. A `vercel.app` deployment
   URL cannot be used as the sender domain.
2. In Resend, use **Integrations → Connect to Supabase** and select the
   `hustlrzzv2` project and verified domain. Resend configures Supabase Auth's
   email provider without putting an SMTP credential in this repository.
3. Change `supabase/config.toml` to `enable_confirmations = true` and run:

   ```bash
   supabase config push --project-ref qvxfwvtezwaczqsxbcwp
   ```

4. Ensure `site_url` is the current production frontend URL and add any active
   Preview URL to `additional_redirect_urls` before testing sign-up and password
   reset links.
