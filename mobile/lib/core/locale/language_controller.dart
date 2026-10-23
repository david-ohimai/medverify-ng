import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_language.dart';
import '../storage/storage_providers.dart';

/// The language results are shown and spoken in. Persisted in preferences.
final languageProvider = NotifierProvider<LanguageController, AppLanguage>(LanguageController.new);

class LanguageController extends Notifier<AppLanguage> {
  @override
  AppLanguage build() => ref.watch(preferencesStoreProvider).language;

  Future<void> select(AppLanguage language) async {
    if (language == state) return;
    state = language;
    await ref.read(preferencesStoreProvider).setLanguage(language);
  }
}
