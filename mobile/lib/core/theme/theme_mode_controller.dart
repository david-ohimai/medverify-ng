import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/storage_providers.dart';

/// The app's theme mode (system / light / dark), persisted in preferences.
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ref.watch(preferencesStoreProvider).themeMode;

  Future<void> select(ThemeMode mode) async {
    if (mode == state) return;
    state = mode;
    await ref.read(preferencesStoreProvider).setThemeMode(mode);
  }
}
