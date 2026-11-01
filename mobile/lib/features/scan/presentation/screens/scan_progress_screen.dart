import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/ai_insight_card.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../providers/scan_providers.dart';
import '../widgets/step_timeline.dart';

/// Shows the pipeline live, then hands over to the verdict. All state is in
/// [scanProgressProvider]; this screen only renders it and navigates once.
class ScanProgressScreen extends ConsumerWidget {
  const ScanProgressScreen({required this.scanId, super.key});

  final String scanId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Verdict in → replace this screen with the result (back goes to Scan, not here).
    ref.listen(scanProgressProvider(scanId).select((p) => p.result), (_, result) {
      if (result != null && context.mounted) {
        Future<void>.delayed(const Duration(milliseconds: 700), () {
          if (context.mounted) context.pushReplacement(AppRoutes.scanResult(scanId));
        });
      }
    });
    final progress = ref.watch(scanProgressProvider(scanId));
    final photo = ref.watch(capturedPhotosProvider.select((photos) => photos[scanId]));

    return DetailScaffold(
      title: 'Checking your pack',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.gutter),
        children: [
          if (photo != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              child: AspectRatio(
                aspectRatio: 16 / 10,
                child: Image.file(File(photo), fit: BoxFit.cover, cacheWidth: 900),
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          GlassCard(
            padding: const EdgeInsets.all(AppSpacing.lg),
            shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AiPill(label: 'AI at work'),
                const SizedBox(height: AppSpacing.lg),
                StepTimeline(steps: progress.steps),
              ],
            ),
          ),
          if (progress.errorMessage != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _Failed(message: progress.errorMessage!),
          ],
        ],
      ),
    );
  }
}

class _Failed extends StatelessWidget {
  const _Failed({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Iconsax.camera_slash, color: context.palette.suspicious),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text("Couldn't check this photo", style: context.text.titleMedium)),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(message, style: context.text.bodyMedium),
          const SizedBox(height: AppSpacing.lg),
          FilledButton.icon(
            onPressed: () => context.pop(),
            icon: const Icon(Iconsax.camera),
            label: const Text('Rescan the medicine pack'),
          ),
          const SizedBox(height: AppSpacing.xs),
          TextButton(
            onPressed: () => context.pushReplacement(AppRoutes.manualCheck),
            child: const Text('Type the NAFDAC number instead'),
          ),
        ],
      ),
    ),
  );
}
