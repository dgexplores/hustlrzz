// Web implementation for the Supabase session storage with a "Remember me"
// preference.
//
// Two backends, chosen dynamically at every read/write based on the current
// preference (read live from localStorage so it always reflects the last
// checkbox the user saw):
//
//   * Persistent ("Remember me" checked): the session lives in localStorage
//     and survives browser restarts — the login persists across visits.
//   * Session-only (unchecked): the session lives in sessionStorage and dies
//     the moment the tab or browser closes — leaving the site asks for a
//     fresh sign-in (page refreshes within the tab are fine).
//
// The preference itself lives in localStorage so it survives visits and can be
// read at app startup, before the first auth call.
import 'package:web/web.dart' as web;

/// localStorage key that stores the "remember me" preference ('1' / absent).
const rememberMeStorageKey = 'hustlrzz_remember_me';

bool getRememberMePreference() =>
    web.window.localStorage.getItem(rememberMeStorageKey) == '1';

void setRememberMePreference(bool value) {
  if (value) {
    web.window.localStorage.setItem(rememberMeStorageKey, '1');
  } else {
    web.window.localStorage.removeItem(rememberMeStorageKey);
  }
}

// --- Persistent backend (localStorage) ---

bool hasPersistentSession(String key) =>
    web.window.localStorage.getItem(key) != null;

String? getPersistentSession(String key) =>
    web.window.localStorage.getItem(key);

void setPersistentSession(String key, String value) =>
    web.window.localStorage.setItem(key, value);

void removePersistentSession(String key) =>
    web.window.localStorage.removeItem(key);

// --- Session-only backend (sessionStorage, per tab) ---

bool hasSessionSession(String key) =>
    web.window.sessionStorage.getItem(key) != null;

String? getSessionSession(String key) =>
    web.window.sessionStorage.getItem(key);

void setSessionSession(String key, String value) =>
    web.window.sessionStorage.setItem(key, value);

void removeSessionSession(String key) =>
    web.window.sessionStorage.removeItem(key);
