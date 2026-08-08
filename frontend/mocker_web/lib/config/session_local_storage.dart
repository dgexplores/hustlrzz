import 'package:supabase_flutter/supabase_flutter.dart';

import 'session_storage_stub.dart'
    if (dart.library.js_interop) 'session_storage_web.dart';

/// A [LocalStorage] that keeps the Supabase session shared across browser
/// tabs while still requiring a fresh sign-in once the whole browser is
/// closed.
///
/// The token is stored in *localStorage* (so every tab shares the login), and
/// a per-tab heartbeat registry + `pagehide` listener clears it as soon as the
/// last tab goes away. Page refreshes keep the same tab alive, so F5 does not
/// log you out.
///
/// On non-web targets (this project ships as a web app) it falls back to an
/// in-memory map, so the session dies with the process.
class SessionLocalStorage extends LocalStorage {
  SessionLocalStorage({required this.persistSessionKey});

  final String persistSessionKey;

  @override
  Future<void> initialize() => initializeSessionStorage(persistSessionKey);

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
