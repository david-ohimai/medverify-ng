import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/app_language.dart';
import '../constants/storage_keys.dart';

/// Plain settings — nothing sensitive. Loaded into memory once at startup
/// (SharedPreferencesWithCache), so every read is synchronous.
class PreferencesStore {
  const PreferencesStore(this._prefs);

  final SharedPreferencesWithCache _prefs;

  ThemeMode get themeMode => switch (_prefs.getString(StorageKeys.themeMode)) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  Future<void> setThemeMode(ThemeMode mode) => _prefs.setString(StorageKeys.themeMode, mode.name);

  AppLanguage get language => AppLanguage.fromCode(_prefs.getString(StorageKeys.language));

  Future<void> setLanguage(AppLanguage language) => _prefs.setString(StorageKeys.language, language.code);

  bool get onboardingDone => _prefs.getBool(StorageKeys.onboardingDone) ?? false;

  Future<void> setOnboardingDone() => _prefs.setBool(StorageKeys.onboardingDone, true);
}
