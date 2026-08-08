// Web implementation: sessions live in the browser's sessionStorage, which is
// cleared automatically when the tab or window is closed.
import 'package:web/web.dart' as web;

Future<void> initializeSessionStorage() async {}

Future<bool> hasSessionItem(String key) async =>
    web.window.sessionStorage.getItem(key) != null;

Future<String?> getSessionItem(String key) async =>
    web.window.sessionStorage.getItem(key);

Future<void> setSessionItem(String key, String value) async {
  web.window.sessionStorage.setItem(key, value);
}

Future<void> removeSessionItem(String key) async {
  web.window.sessionStorage.removeItem(key);
}
