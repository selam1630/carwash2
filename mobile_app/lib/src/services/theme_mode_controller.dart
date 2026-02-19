import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session_kv.dart';

class ThemeModeController {
  ThemeModeController._();

  static const String _storageKey = 'app_theme_mode';
  static final FlutterSecureStorage _secure = const FlutterSecureStorage();
  static final ValueNotifier<ThemeMode> mode = ValueNotifier(ThemeMode.light);

  static Future<void> initialize() async {
    final saved = await _read();
    if (saved == 'dark') {
      mode.value = ThemeMode.dark;
    } else {
      mode.value = ThemeMode.light;
    }
  }

  static Future<void> toggle() async {
    final next =
        mode.value == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    mode.value = next;
    await _write(next == ThemeMode.dark ? 'dark' : 'light');
  }

  static Future<String?> _read() async {
    if (isSessionKvAvailable) {
      return sessionRead(_storageKey);
    }
    try {
      return await _secure.read(key: _storageKey);
    } catch (_) {
      return null;
    }
  }

  static Future<void> _write(String value) async {
    if (isSessionKvAvailable) {
      sessionWrite(_storageKey, value);
      return;
    }
    try {
      await _secure.write(key: _storageKey, value: value);
    } catch (_) {}
  }
}
