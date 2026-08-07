import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
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
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Firebase App Check (web): attest requests come from this app. The
  // reCAPTCHA site key is injected via dart-define; when it is not configured
  // (e.g. fresh local dev) App Check is skipped so the app still boots.
  // reCAPTCHA Enterprise is used because the Firebase console now only offers
  // the Enterprise provider when registering new web apps.
  if (DefaultFirebaseOptions.appCheckReCaptchaSiteKey.isNotEmpty) {
    await FirebaseAppCheck.instance.activate(
      webProvider: ReCaptchaEnterpriseProvider(
        DefaultFirebaseOptions.appCheckReCaptchaSiteKey,
      ),
    );
    FirebaseAppCheck.instance.setTokenAutoRefreshEnabled(true);
  }

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
