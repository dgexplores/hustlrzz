// Supabase configuration.
//
// The project URL and anon (publishable) key are injected at build/run time
// via `--dart-define-from-file` (or `--dart-define`) so no secrets are
// committed to the repository. The anon key is safe to ship in a web app;
// Row-Level Security in supabase_schema.sql is what protects the data.
//
// Setup:
//   1. cp dart_defines.env.example dart_defines.env  (already gitignored)
//   2. Fill in SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project
//      (Project Settings -> API, or Dashboard -> Connect).
//   3. Run/build with:
//        flutter run --dart-define-from-file=dart_defines.env
//        flutter build web --release --dart-define-from-file=dart_defines.env

class SupabaseConfig {
  static const String url = String.fromEnvironment('SUPABASE_URL');
  static const String anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Throws a clear, actionable error when Supabase is not configured.
  static void assertConfigured() {
    if (url.isEmpty || anonKey.isEmpty) {
      throw StateError(
        'Missing Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY).\n'
        'The config is injected at build time so no secrets live in the repo.\n\n'
        'Fix: from frontend/mocker_web run\n'
        '  cp dart_defines.env.example dart_defines.env\n'
        'fill in your Supabase values, then run/build with:\n'
        '  flutter run --dart-define-from-file=dart_defines.env\n'
        '  (or: flutter build web --release --dart-define-from-file=dart_defines.env)',
      );
    }
  }
}
