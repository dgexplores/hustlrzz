import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/api_config.dart';
import '../utils/friendly_errors.dart';

/// AuthService backed by Supabase (email/password + Google/Apple OAuth).
///
/// The public API is unchanged from the Firebase-backed version so pages
/// keep working: isLoggedIn, needsEmailVerification, signInWithGoogle(),
/// signInWithEmail(), signUpWithEmail(), deleteAccount(), etc.
class AuthService extends ChangeNotifier {
  User? _user;
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic>? _userProfile; // store user profile from backend

  // Getters
  User? get currentUser => _user;
  bool get isLoggedIn => _user != null;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String? get userEmail => _user?.email;
  String? get userName => _user?.userMetadata?['full_name'] as String?;
  String? get userPhotoURL => _user?.userMetadata?['avatar_url'] as String?;
  Map<String, dynamic>? get userProfile => _userProfile;

  AuthService() {
    // Listen for Supabase auth state changes (initial session, OAuth/email
    // redirects, sign in/out) and mirror them into this ChangeNotifier.
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      _user = data.session?.user;
      if (_user != null) {
        _initializeUser(); // user login, call backend to initialize
      } else {
        _userProfile = null; // user logout, clear profile
      }
      notifyListeners();
    });
  }

  // get current user's access token (Supabase JWT)
  Future<String?> _getIdToken() async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      return session?.accessToken;
    } catch (e) {
      debugPrint('Failed to get access token: $e');
      return null;
    }
  }

  /// Public token accessor (used by pages for authorized API calls).
  Future<String?> getIdToken() => _getIdToken();

  // call backend /auth/init to initialize user
  Future<void> _initializeUser() async {
    try {
      final token = await _getIdToken();
      if (token == null) {
        throw Exception('No authentication token available');
      }

      debugPrint('Calling /auth/init API...');

      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}${ApiConfig.authInitEndpoint}'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _userProfile = data['data'];
        debugPrint('✅ Real API: User initialized successfully');
        notifyListeners();
        return;
      } else {
        throw Exception(
          'API returned ${response.statusCode}: ${response.body}',
        );
      }
    } catch (e) {
      debugPrint('❌ Failed to initialize user profile: $e');
      _userProfile = null;
      notifyListeners();
    }
  }

  // Google sign in (OAuth redirect on web — no People API required)
  Future<bool> signInWithGoogle() async {
    try {
      _setLoading(true);
      _clearError();

      await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: Uri.base.toString(),
        authScreenLaunchMode: LaunchMode.platformDefault,
      );

      // On web this navigates to Supabase's hosted Google flow; the session
      // is restored on return via onAuthStateChange above.
      _setLoading(false);
      return true;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Google sign in error: $e');
      }
      return false;
    }
  }

  // Apple sign in (OAuth redirect on web)
  Future<bool> signInWithApple() async {
    try {
      _setLoading(true);
      _clearError();

      await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.apple,
        redirectTo: Uri.base.toString(),
        authScreenLaunchMode: LaunchMode.platformDefault,
      );

      _setLoading(false);
      return true;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Apple sign in error: $e');
      }
      return false;
    }
  }

  // Email/Password sign up
  Future<bool> signUpWithEmail(
      String email, String password, String displayName) async {
    try {
      _setLoading(true);
      _clearError();

      final res = await Supabase.instance.client.auth.signUp(
        email: email,
        password: password,
        data: {'full_name': displayName},
      );

      _user = res.user;

      _setLoading(false);
      if (kDebugMode) {
        print('Email sign up successful: ${_user?.email}');
        print('Confirmation email sent (if email confirmation is enabled)');
      }
      return true;
    } on AuthException catch (e) {
      String errorMessage = _signUpErrorMessage(e);
      _setError(errorMessage);
      _setLoading(false);
      if (kDebugMode) {
        print('Email sign up error: $e');
      }
      return false;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Email sign up error: $e');
      }
      return false;
    }
  }

  String _signUpErrorMessage(AuthException e) {
    final msg = e.message.toLowerCase();
    if (msg.contains('already') && msg.contains('registered')) {
      return 'This email is already registered';
    }
    if (msg.contains('invalid') && msg.contains('email')) {
      return 'Invalid email address';
    }
    if (msg.contains('password')) {
      return 'Password is too weak';
    }
    return 'Registration failed: ${e.message}';
  }

  // Email/Password sign in
  Future<bool> signInWithEmail(String email, String password) async {
    try {
      _setLoading(true);
      _clearError();

      final res = await Supabase.instance.client.auth
          .signInWithPassword(email: email, password: password);

      _user = res.user;
      _setLoading(false);

      if (kDebugMode) {
        print('Email sign in successful: ${_user?.email}');
      }

      return true;
    } on AuthException catch (e) {
      String errorMessage = _signInErrorMessage(e);
      _setError(errorMessage);
      _setLoading(false);
      if (kDebugMode) {
        print('Email sign in error: $e');
      }
      return false;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Email sign in error: $e');
      }
      return false;
    }
  }

  String _signInErrorMessage(AuthException e) {
    final msg = e.message.toLowerCase();
    if (msg.contains('invalid login credentials') ||
        msg.contains('invalid email or password')) {
      return 'Invalid email or password';
    }
    if (msg.contains('email not confirmed')) {
      return 'Please verify your email before signing in. Check your inbox.';
    }
    if (msg.contains('invalid') && msg.contains('email')) {
      return 'Invalid email address';
    }
    return 'Login failed: ${e.message}';
  }

  // Send email verification (Supabase resend confirmation)
  Future<bool> sendEmailVerification() async {
    try {
      final email = _user?.email;
      if (email != null && !(isEmailVerified)) {
        await Supabase.instance.client.auth.resend(
          email: email,
          type: OtpType.signup,
        );
        if (kDebugMode) {
          print('Verification email sent to $email');
        }
        return true;
      }
      return false;
    } catch (e) {
      _setError('Failed to send verification email: ${e.toString()}');
      if (kDebugMode) {
        print('Send verification email error: $e');
      }
      return false;
    }
  }

  // Check if email is verified
  Future<bool> checkEmailVerified() async {
    try {
      // Refresh the session so the latest user state (emailConfirmedAt) is
      // fetched from Supabase after the user clicks the confirmation link.
      await Supabase.instance.client.auth.refreshSession();
      _user = Supabase.instance.client.auth.currentUser;
      notifyListeners();
      return isEmailVerified;
    } catch (e) {
      if (kDebugMode) {
        print('Check email verified error: $e');
      }
      return false;
    }
  }

  // Send password reset email
  Future<bool> sendPasswordResetEmail(String email) async {
    try {
      _setLoading(true);
      _clearError();

      await Supabase.instance.client.auth.resetPasswordForEmail(
        email,
        redirectTo: Uri.base.toString(),
      );

      _setLoading(false);
      if (kDebugMode) {
        print('Password reset email sent to $email');
      }
      return true;
    } on AuthException catch (e) {
      String errorMessage = 'Failed to send reset email';
      final msg = e.message.toLowerCase();
      if (msg.contains('not found')) {
        errorMessage = 'No account found with this email';
      } else if (msg.contains('invalid') && msg.contains('email')) {
        errorMessage = 'Invalid email address';
      }
      _setError(errorMessage);
      _setLoading(false);
      if (kDebugMode) {
        print('Password reset error: $e');
      }
      return false;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Password reset error: $e');
      }
      return false;
    }
  }

  // Get email verification status
  bool get isEmailVerified => _user?.emailConfirmedAt != null;

  // Check if user needs email verification (signed up with email but not verified)
  bool get needsEmailVerification {
    if (_user == null) return false;
    // OAuth users (Google/Apple) have confirmed emails; email/password users
    // must confirm before first sign-in when confirmation is enabled.
    final provider = _user?.appMetadata['provider'] as String?;
    final isEmailAuth = provider == null || provider == 'email';
    return isEmailAuth && !isEmailVerified;
  }

  // sign out
  Future<void> signOut() async {
    try {
      _setLoading(true);
      _clearError();

      await Supabase.instance.client.auth.signOut();

      _user = null;
      _userProfile = null;
      _setLoading(false);

      if (kDebugMode) {
        print('sign out successful');
      }
    } catch (e) {
      _setError('sign out failed: ${e.toString()}');
      _setLoading(false);
      if (kDebugMode) {
        print('sign out error: $e');
      }
    }
  }

  // Delete user account and all data (backend deletes DB rows + auth user)
  Future<bool> deleteAccount() async {
    try {
      _setLoading(true);
      _clearError();

      if (_user == null) {
        _setError('No user logged in');
        _setLoading(false);
        return false;
      }

      final token = await _getIdToken();
      if (token == null) {
        throw Exception('No authentication token available');
      }

      final response = await http.delete(
        Uri.parse('${ApiConfig.baseUrl}${ApiConfig.userEndpoint}'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (response.statusCode != 200) {
        throw Exception('API returned ${response.statusCode}: ${response.body}');
      }

      await Supabase.instance.client.auth.signOut();

      _user = null;
      _userProfile = null;
      _setLoading(false);

      if (kDebugMode) {
        print('Account deleted successfully');
      }

      return true;
    } catch (e) {
      _setError(friendlyErrorMessage(e));
      _setLoading(false);
      if (kDebugMode) {
        print('Delete account error: $e');
      }
      return false;
    }
  }

  // get user ID
  String? getUserId() {
    return _user?.id;
  }

  // check if user is authenticated
  bool isAuthenticated() {
    return _user != null;
  }

  // check if user is new
  bool isNewUser() {
    if (_userProfile != null && _userProfile!['user'] != null) {
      return _userProfile!['user']['isNew'] ?? false;
    }
    return false;
  }

  // private method
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _error = error;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
    notifyListeners();
  }
}
