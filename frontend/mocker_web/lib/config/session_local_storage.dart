import 'package:supabase_flutter/supabase_flutter.dart';

import 'session_storage_stub.dart'
    if (dart.library.js_interop) 'session_storage_web.dart';

/// The localStorage key under which Supabase stores a session for a host —
/// kept in sync with the key supabase_flutter would use itself, so the login
/// page and app init agree on where the session lives.
String supabaseSessionPersistKey(String supabaseUrl) =>
    'sb-${Uri.parse(supabaseUrl).host.split('.').first}-auth-token';

/// A [LocalStorage] whose persistence follows the "Remember me" checkbox.
///
/// The preference is read live at every operation, so whatever the user last
/// chose is what applies:
///   * checked   -> session is stored in localStorage (persists across visits
///                  and browser restarts)
///   * unchecked -> session is stored in sessionStorage (dies when the tab or
///                  browser closes; page refreshes within the tab are fine)
///
/// On non-web targets (this project ships as a web app) both modes fall back
/// to in-memory maps, so sessions die with the process.
class RememberMeLocalStorage extends LocalStorage {
  RememberMeLocalStorage({required this.persistSessionKey});

  final String persistSessionKey;

  bool get _rememberMe => getRememberMePreference();

  @override
  Future<void> initialize() async {
    // When "remember me" is off, don't let a previous persistent login linger
    // and silently sign the user back in on the next visit.
    if (!_rememberMe) {
      removePersistentSession(persistSessionKey);
    }
  }

  @override
  Future<bool> hasAccessToken() async => _rememberMe
      ? hasPersistentSession(persistSessionKey)
      : hasSessionSession(persistSessionKey);

  @override
  Future<String?> accessToken() async => _rememberMe
      ? getPersistentSession(persistSessionKey)
      : getSessionSession(persistSessionKey);

  @override
  Future<void> persistSession(String persistSessionString) async {
    if (_rememberMe) {
      setPersistentSession(persistSessionKey, persistSessionString);
    } else {
      setSessionSession(persistSessionKey, persistSessionString);
    }
  }

  @override
  Future<void> removePersistedSession() async {
    removePersistentSession(persistSessionKey);
    removeSessionSession(persistSessionKey);
  }

  // --- Preference accessors for the login page ---

  static bool getRememberMe() => getRememberMePreference();

  static void setRememberMe(bool value) => setRememberMePreference(value);

  /// Relocate the persisted session when the user changes the checkbox, so the
  /// very next visit lands on the correct storage.
  static void applyRememberMe({required String persistSessionKey}) {
    if (getRememberMePreference()) {
      final sessionCopy = getSessionSession(persistSessionKey);
      if (sessionCopy != null) {
        setPersistentSession(persistSessionKey, sessionCopy);
      }
    } else {
      removePersistentSession(persistSessionKey);
    }
  }
}
