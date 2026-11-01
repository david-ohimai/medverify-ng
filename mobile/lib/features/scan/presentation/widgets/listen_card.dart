import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../providers/listen_providers.dart';

/// 🔊 Listen: the verdict read aloud in English, Pidgin, Hausa, Yoruba or
/// Igbo. The words are always shown too, for phones without that voice,
/// and for anyone who prefers to read.
class ListenCard extends ConsumerWidget {
  const ListenCard({required this.scanId, super.key});

  final String scanId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(listenControllerProvider(scanId));
    final controller = ref.read(listenControllerProvider(scanId).notifier);
    final palette = context.palette;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Iconsax.volume_high, color: palette.action),
                const SizedBox(width: AppSpacing.xs),
                Expanded(child: Text('Listen', style: context.text.titleMedium)),
                IconButton.filled(
                  onPressed: state.loading ? null : (state.speaking ? controller.stop : controller.play),
                  style: IconButton.styleFrom(backgroundColor: palette.action, foregroundColor: palette.onAction),
                  icon: Icon(state.speaking ? Iconsax.stop : Iconsax.play),
                  tooltip: state.speaking ? 'Stop' : 'Play',
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            PillTabs(
              labels: [for (final language in AppLanguage.values) language.nativeName],
              selected: state.language.index,
              onSelected: (i) => controller.selectLanguage(AppLanguage.values[i]),
            ),
            if (state.loading) ...[
              const SizedBox(height: AppSpacing.sm),
              const AppShimmer(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ShimmerLine(widthFactor: 0.95),
                    SizedBox(height: AppSpacing.xs),
                    ShimmerLine(widthFactor: 0.6),
                  ],
                ),
              ),
            ],
            if (state.text != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(state.text!, style: context.text.bodyLarge),
            ],
            if (state.voiceMissing) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                'No ${state.language.englishName} voice on this phone, the text is shown instead.',
                style: context.text.bodySmall,
              ),
            ],
            if (state.error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Icon(Iconsax.info_circle, size: 18, color: palette.suspicious),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(child: Text(state.error!, style: context.text.bodyMedium)),
                  TextButton(onPressed: controller.play, child: const Text('Try again')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
