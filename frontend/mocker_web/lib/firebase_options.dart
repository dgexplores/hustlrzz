// Firebase configuration placeholder.
//
// IMPORTANT: this file must contain YOUR OWN Firebase project's web app
// configuration before the app can authenticate users.
//
// Regenerate it with your own Firebase project:
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. Enable Authentication (Email/Password + Google) and Firestore
//   3. Add a Web app to the project
//   4. From the frontend/mocker_web directory run:
//        dart pub global activate flutterfire_cli
//        flutterfire configure
//
// That command writes the correct values to this file automatically.

// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
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

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'REDACTED',
    appId: '1:970566023417:web:5a205a3c04e69ba4d9ca28',
    messagingSenderId: '970566023417',
    projectId: 'hustlrzz',
    authDomain: 'hustlrzz.firebaseapp.com',
    storageBucket: 'hustlrzz.firebasestorage.app',
    measurementId: 'G-0PMZGE5YJS',
  );
}
