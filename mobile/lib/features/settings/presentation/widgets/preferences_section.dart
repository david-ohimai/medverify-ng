import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../core/locale/language_controller.dart';
import '../../../../core/theme/theme_mode_controller.dart';
import '../../../../shared/widgets/language_option_tile.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';

class PreferencesSection extends StatelessWidget {
  const PreferencesSection({super.key});

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SectionHeader(title: 'Appearance'),
      _ThemePicker(),
      SectionHeader(title: 'Language'),
      _LanguageList(),
    ],
  );
}

class _ThemePicker extends ConsumerWidget {
  const _ThemePicker();

  static const _modes = [ThemeMode.system, ThemeMode.light, ThemeMode.dark];
  static const _labels = ['System', 'Light', 'Dark'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return PillTabs(
      labels: _labels,
      selected: _modes.indexOf(mode),
      onSelected: (i) => ref.read(themeModeProvider.notifier).select(_modes[i]),
    );
  }
}

class _LanguageList extends ConsumerWidget {
  const _LanguageList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(languageProvider);
    final controller = ref.read(languageProvider.notifier);
    return Column(
      children: [
        for (final language in AppLanguage.values)
          LanguageOptionTile(
            language: language,
            selected: language == selected,
            onTap: () => controller.select(language),
          ),
      ],
    );
  }
}
