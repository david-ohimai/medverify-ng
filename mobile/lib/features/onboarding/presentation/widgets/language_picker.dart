import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../shared/widgets/language_option_tile.dart';
import '../providers/onboarding_providers.dart';

/// Only this widget watches the selected language, so picking one doesn't
/// rebuild the rest of the onboarding screen.
class LanguagePicker extends ConsumerWidget {
  const LanguagePicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(onboardingControllerProvider.select((s) => s.language));
    final controller = ref.read(onboardingControllerProvider.notifier);
    return Column(
      children: [
        for (final language in AppLanguage.values)
          LanguageOptionTile(
            language: language,
            selected: language == selected,
            onTap: () => controller.selectLanguage(language),
          ),
      ],
    );
  }
}
