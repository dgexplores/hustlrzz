import 'package:supabase_flutter/supabase_flutter.dart';

import 'session_storage_stub.dart'
    if (dart.library.js_interop) 'session_storage_web.dart';

/// A [LocalStorage] that keeps the Supabase session alive only for the
/// lifetime of the browser tab.
///
/// Sessions are written to the browser's *session* storage instead of local
/// storage: they survive page reloads (F5/refresh) but are wiped automatically
/// the moment the tab or browser window is closed. Leaving the site therefore
/// always requires signing in again — there is no persistent login.
///
/// On non-web targets (this project ships as a web app) it falls back to an
/// in-memory map, so the session dies with the process.
class SessionLocalStorage extends LocalStorage {
  SessionLocalStorage({required this.persistSessionKey});

  final String persistSessionKey;

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() => hasSessionItem(persistSessionKey);

  @override
  Future<String?> accessToken() => getSessionItem(persistSessionKey);

  @override
  Future<void> removePersistedSession() =>
      removeSessionItem(persistSessionKey);

  @override
  Future<void> persistSession(String persistSessionString) =>
      setSessionItem(persistSessionKey, persistSessionString);
}
