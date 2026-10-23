import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../providers/settings_providers.dart';
import '../widgets/about_section.dart';
import '../widgets/preferences_section.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _tabs = ['Preferences', 'About'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(settingsTabProvider);
    return PageLayout(
      title: 'Settings',
      subtitle: 'Language, appearance and your data',
      slivers: [
        SliverToBoxAdapter(
          child: PillTabs(labels: _tabs, selected: tab, onSelected: ref.read(settingsTabProvider.notifier).select),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        SliverToBoxAdapter(child: tab == 0 ? const PreferencesSection() : const AboutSection()),
      ],
    );
  }
}
