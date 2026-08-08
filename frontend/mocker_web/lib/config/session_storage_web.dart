// Web implementation for the Supabase session storage.
//
// The session token lives in the browser's *localStorage*, so it is shared
// across all tabs of the site. To keep login from surviving the closure of
// the whole browser, every tab registers itself in a small heartbeat registry
// (also in localStorage):
//
//   * Each tab owns a stable id kept in sessionStorage (which survives page
//     refreshes within the tab, so F5 does not log you out).
//   * While open, a tab re-registers its heartbeat every few seconds.
//   * When a tab is closed, the `pagehide` listener removes it from the
//     registry. A *refresh* re-registers the same tab id on load, so the
//     session survives.
//   * A brand-new tab (no id in its sessionStorage) that finds an empty
//     registry knows the previous session ended, and clears the token — so
//     after closing the last tab (or the whole browser), the next visit asks
//     for a fresh sign-in.
import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:math';

import 'package:web/web.dart' as web;

/// How often a live tab re-registers its heartbeat.
const _heartbeatInterval = Duration(seconds: 2);

/// Registry entries older than this are considered dead (tab crashed/was
/// killed without firing `pagehide`) and are pruned.
const _staleAfter = Duration(seconds: 6);

String _registryKey(String persistSessionKey) => '$persistSessionKey:tabs';
String _tabIdKey(String persistSessionKey) => '$persistSessionKey:tabid';

bool _started = false;

/// Sets up the tab lifecycle. Called once from [SessionLocalStorage.initialize].
Future<void> initializeSessionStorage(String persistSessionKey) async {
  if (_started) return;
  _started = true;

  final isRefresh =
      web.window.sessionStorage.getItem(_tabIdKey(persistSessionKey)) != null;

  if (!isRefresh) {
    // Brand-new tab: if no other tab is alive, the previous session ended.
    _pruneRegistry(persistSessionKey);
    if (_liveTabIds(persistSessionKey).isEmpty) {
      web.window.localStorage.removeItem(persistSessionKey);
    }
  }

  _register(persistSessionKey);

  // Keep this tab alive while it is open, and prune dead tabs. Own entry is
  // registered BEFORE the empty-check so a throttled background tab can never
  // prune its own (stale) heartbeat and wipe the session while still alive.
  Timer.periodic(_heartbeatInterval, (_) {
    _register(persistSessionKey);
    _pruneRegistry(persistSessionKey);
    if (_liveTabIds(persistSessionKey).isEmpty) {
      web.window.localStorage.removeItem(persistSessionKey);
    }
  });

  // When this tab closes, drop it from the registry. Note: we deliberately do
  // NOT clear the token here — a refresh would then wipe the session before
  // the new page can re-register. Clearing happens on the next brand-new tab.
  web.window.addEventListener('pagehide', ((web.Event _) {
    final registry = _readRegistry(persistSessionKey);
    registry.remove(_tabId(persistSessionKey));
    _writeRegistry(persistSessionKey, registry);
  }).toJS);
}

Future<bool> hasSessionItem(String key) async =>
    web.window.localStorage.getItem(key) != null;

Future<String?> getSessionItem(String key) async =>
    web.window.localStorage.getItem(key);

Future<void> setSessionItem(String key, String value) async {
  web.window.localStorage.setItem(key, value);
}

Future<void> removeSessionItem(String key) async {
  web.window.localStorage.removeItem(key);
}

// --- Tab registry helpers ---

String _tabId(String persistSessionKey) {
  final existing = web.window.sessionStorage.getItem(_tabIdKey(persistSessionKey));
  if (existing != null && existing.isNotEmpty) return existing;
  final fresh =
      't${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(1 << 31)}';
  web.window.sessionStorage.setItem(_tabIdKey(persistSessionKey), fresh);
  return fresh;
}

Map<String, dynamic> _readRegistry(String persistSessionKey) {
  final raw = web.window.localStorage.getItem(_registryKey(persistSessionKey));
  if (raw == null || raw.isEmpty) return <String, dynamic>{};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map) return decoded.cast<String, dynamic>();
  } catch (_) {
    // Corrupt registry — start fresh.
  }
  return <String, dynamic>{};
}

void _writeRegistry(String persistSessionKey, Map<String, dynamic> registry) {
  web.window.localStorage.setItem(_registryKey(persistSessionKey), jsonEncode(registry));
}

void _register(String persistSessionKey) {
  final registry = _readRegistry(persistSessionKey);
  registry[_tabId(persistSessionKey)] = DateTime.now().millisecondsSinceEpoch;
  _writeRegistry(persistSessionKey, registry);
}

void _pruneRegistry(String persistSessionKey) {
  final registry = _readRegistry(persistSessionKey);
  final cutoff = DateTime.now().millisecondsSinceEpoch - _staleAfter.inMilliseconds;
  registry.removeWhere((_, ts) => ts is! int || ts < cutoff);
  _writeRegistry(persistSessionKey, registry);
}

Set<String> _liveTabIds(String persistSessionKey) {
  final registry = _readRegistry(persistSessionKey);
  final cutoff = DateTime.now().millisecondsSinceEpoch - _staleAfter.inMilliseconds;
  return registry.entries
      .where((e) => e.value is int && e.value >= cutoff)
      .map((e) => e.key)
      .toSet();
}
