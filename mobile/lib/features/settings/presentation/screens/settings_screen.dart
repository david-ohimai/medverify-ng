import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../regulator/presentation/widgets/regulator_section.dart';
import '../providers/settings_providers.dart';
import '../widgets/about_section.dart';
import '../widgets/preferences_section.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _tabs = ['Preferences', 'Regulator', 'About'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(settingsTabProvider);
    return PageLayout(
      title: 'Settings',
      subtitle: 'Language, appearance and regulator mode',
      slivers: [
        SliverToBoxAdapter(
          child: PillTabs(labels: _tabs, selected: tab, onSelected: ref.read(settingsTabProvider.notifier).select),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        SliverToBoxAdapter(
          child: switch (tab) {
            0 => const PreferencesSection(),
            1 => const RegulatorSection(),
            _ => const AboutSection(),
          },
        ),
      ],
    );
  }
}
