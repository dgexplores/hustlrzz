// Non-web fallback: keep sessions in memory only, so they die with the process.
final Map<String, String> _memory = {};

Future<void> initializeSessionStorage() async {}

Future<bool> hasSessionItem(String key) async => _memory.containsKey(key);

Future<String?> getSessionItem(String key) async => _memory[key];

Future<void> setSessionItem(String key, String value) async {
  _memory[key] = value;
}

Future<void> removeSessionItem(String key) async {
  _memory.remove(key);
}
