// Non-web fallback: both modes are in-memory maps, so sessions die with the
// process. Kept API-identical to the web implementation.
final Map<String, String> _persistentMemory = {};
final Map<String, String> _sessionMemory = {};

/// localStorage key that stores the "remember me" preference ('1' / absent).
const rememberMeStorageKey = 'hustlrzz_remember_me';

bool getRememberMePreference() => false;

void setRememberMePreference(bool value) {}

// --- Persistent backend ---

bool hasPersistentSession(String key) => _persistentMemory.containsKey(key);

String? getPersistentSession(String key) => _persistentMemory[key];

void setPersistentSession(String key, String value) {
  _persistentMemory[key] = value;
}

void removePersistentSession(String key) {
  _persistentMemory.remove(key);
}

// --- Session-only backend ---

bool hasSessionSession(String key) => _sessionMemory.containsKey(key);

String? getSessionSession(String key) => _sessionMemory[key];

void setSessionSession(String key, String value) {
  _sessionMemory[key] = value;
}

void removeSessionSession(String key) {
  _sessionMemory.remove(key);
}
