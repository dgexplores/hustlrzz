import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'package:web/web.dart' as web;
import 'theme/app_theme.dart';
import 'pages/dashboard_page.dart';
import 'pages/login_page.dart';
import 'pages/register_page.dart';
import 'pages/email_verification_page.dart';
import 'pages/forgot_password_page.dart';
import 'pages/privacy_policy_page.dart';
import 'pages/terms_of_service_page.dart';
import 'services/auth_service.dart';
import 'config/supabase_config.dart';
import 'config/session_local_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _reloadOnAppUpdate();

  SupabaseConfig.assertConfigured();

  // Supabase (auth + Postgres). PKCE flow is required for web OAuth/email
  // redirects so the session is exchanged safely without exposing the auth
  // code in the URL.
  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
    authOptions: FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
      // Session persistence follows the "Remember me" checkbox on the login
      // page: checked = localStorage (login persists across visits),
      // unchecked = sessionStorage (login dies when the tab/browser closes).
      localStorage: RememberMeLocalStorage(
        persistSessionKey: supabaseSessionPersistKey(SupabaseConfig.url),
      ),
    ),
  );

  runApp(const HustlrzzApp());
}

/// Reload the app when a freshly deployed version takes over.
///
/// Flutter web ships a service worker that caches the app bundle. After a
/// redeploy the new service worker activates and claims the open tab
/// ([clients.claim]), but the tab keeps running the OLD JavaScript it already
/// loaded — which can point at an outdated backend or carry old auth config,
/// surfacing as "Couldn't reach the server" errors or a broken login flow.
/// Listening for [controllerchange] lets us reload exactly when the new
/// version goes live, so users always run the latest build.
void _reloadOnAppUpdate() {
  if (!kIsWeb) return;
  try {
    final container = web.window.navigator.serviceWorker;
    container.addEventListener('controllerchange', ((web.Event event) {
      debugPrint('🔄 New app version detected — reloading to latest build');
      web.window.location.reload();
    }).toJS);
  } catch (e) {
    debugPrint('Failed to set up app-update watcher: $e');
  }
}

class HustlrzzApp extends StatelessWidget {
  const HustlrzzApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
      ],
      child: MaterialApp(
        title: 'Hustlrzz interview preparation',
        theme: AppTheme.lightTheme,
        debugShowCheckedModeBanner: false,
        home: const AuthWrapper(),
        routes: {
          '/login': (context) => const LoginPage(),
          '/register': (context) => const RegisterPage(),
          '/dashboard': (context) => const DashboardPage(),
          '/email-verification': (context) => const EmailVerificationPage(),
          '/forgot-password': (context) => const ForgotPasswordPage(),
          '/privacy': (context) => const PrivacyPolicyPage(),
          '/terms': (context) => const TermsOfServicePage(),
        },
      ),
    );
  }
}

/// Wrapper to handle initial authentication state
class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (context, authService, child) {
        // If not logged in, show login page
        if (!authService.isLoggedIn) {
          return const LoginPage();
        }

        // If logged in but email not verified (for email/password users)
        if (authService.needsEmailVerification) {
          return const EmailVerificationPage();
        }

        // Logged in and verified (or Google user), show dashboard
        return const DashboardPage();
      },
    );
  }
}
