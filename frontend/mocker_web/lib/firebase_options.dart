// Firebase configuration.
//
// All Firebase config values (including the API key) are injected at
// build/run time via `--dart-define-from-file` (or `--dart-define`) so that
// no secrets are committed to the repository.
//
// Setup:
//   1. Copy `dart_defines.env.example` to `dart_defines.env` (already gitignored)
//      and fill in your own Firebase project's web app config:
//        cp dart_defines.env.example dart_defines.env
//      (If you have already run `flutterfire configure`, you can copy the values
//      it generated from a previous version of this file.)
//   2. Run/build the app with:
//        flutter run --dart-define-from-file=dart_defines.env
//        flutter build web --release --dart-define-from-file=dart_defines.env
//
// If the app is started without these defines, a descriptive error is thrown
// instead of silently shipping an empty/misconfigured project.

// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  /// reCAPTCHA v3 site key for Firebase App Check (web). Optional: when unset,
  /// the app starts without App Check so local dev keeps working; once the key
  /// is configured (dart_defines.env / CI) App Check activates automatically.
  static const String appCheckReCaptchaSiteKey = String.fromEnvironment(
    'FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY',
  );

  static const String _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const String _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const String _messagingSenderId =
      String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const String _projectId =
      String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const String _authDomain =
      String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const String _storageBucket =
      String.fromEnvironment('FIREBASE_STORAGE_BUCKET');
  static const String _measurementId =
      String.fromEnvironment('FIREBASE_MEASUREMENT_ID');

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      _assertConfigured();
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for this platform - '
          'run `flutterfire configure` to generate them.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  /// Throws a clear, actionable error when any required Firebase value is
  /// missing (i.e. the app was run without the dart-defines).
  static void _assertConfigured() {
    const missing = <String, String>{
      'FIREBASE_API_KEY': _apiKey,
      'FIREBASE_APP_ID': _appId,
      'FIREBASE_MESSAGING_SENDER_ID': _messagingSenderId,
      'FIREBASE_PROJECT_ID': _projectId,
      'FIREBASE_AUTH_DOMAIN': _authDomain,
      'FIREBASE_STORAGE_BUCKET': _storageBucket,
      'FIREBASE_MEASUREMENT_ID': _measurementId,
    };

    final unset = missing.entries
        .where((entry) => entry.value.isEmpty)
        .map((entry) => entry.key)
        .toList();

    if (unset.isNotEmpty) {
      throw StateError(
        'Missing Firebase configuration: ${unset.join(', ')}.\n'
        'The Firebase config is injected at build time so no secrets live in '
        'the repository.\n\n'
        'Fix: from frontend/mocker_web run\n'
        '  cp dart_defines.env.example dart_defines.env\n'
        'fill in your Firebase web app values, then run/build with:\n'
        '  flutter run --dart-define-from-file=dart_defines.env\n'
        '  (or: flutter build web --release --dart-define-from-file=dart_defines.env)',
      );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: _apiKey,
    appId: _appId,
    messagingSenderId: _messagingSenderId,
    projectId: _projectId,
    authDomain: _authDomain,
    storageBucket: _storageBucket,
    measurementId: _measurementId,
  );
}
