import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
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
