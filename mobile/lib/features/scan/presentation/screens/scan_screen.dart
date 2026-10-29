import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../providers/scan_providers.dart';

/// Choose how to check a pack: photograph it (camera or gallery), or type
/// the NAFDAC number. The work happens in [CaptureController].
class ScanScreen extends StatelessWidget {
  const ScanScreen({super.key});

  @override
  Widget build(BuildContext context) => const PageLayout(
    title: 'Scan',
    subtitle: 'Check a medicine pack in seconds',
    slivers: [
      SliverToBoxAdapter(child: _CaptureCard()),
      SliverToBoxAdapter(child: SectionHeader(title: 'For the best result')),
      SliverToBoxAdapter(child: _Tips()),
    ],
  );
}

class _CaptureCard extends ConsumerWidget {
  const _CaptureCard();

  Future<void> _capture(BuildContext context, WidgetRef ref, ImageSource source) async {
    final scanId = await ref.read(captureControllerProvider.notifier).capture(source);
    if (scanId != null && context.mounted) context.push(AppRoutes.scanProgress(scanId));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(captureControllerProvider);
    final palette = context.palette;

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 140,
            decoration: BoxDecoration(
              color: palette.actionContainer,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Center(
              child: state is CaptureBusy
                  ? AppShimmer(child: Icon(Iconsax.scan_barcode, size: 64, color: palette.action))
                  : Icon(Iconsax.scan_barcode, size: 64, color: palette.action),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Photograph the side with the NAFDAC number', style: context.text.titleMedium),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            'MedVerify reads the label, checks the NAFDAC register and compares the pack with a genuine one.',
            style: context.text.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          if (state case CaptureBusy(:final message))
            _BusyRow(message: message)
          else ...[
            FilledButton.icon(
              onPressed: () => _capture(context, ref, ImageSource.camera),
              icon: const Icon(Iconsax.camera),
              label: const Text('Take a photo'),
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              onPressed: () => _capture(context, ref, ImageSource.gallery),
              icon: const Icon(Iconsax.gallery),
              label: const Text('Choose from gallery'),
            ),
          ],
          if (state case CaptureFailed(:final message)) ...[
            const SizedBox(height: AppSpacing.md),
            _ErrorRow(message: message, onDismiss: ref.read(captureControllerProvider.notifier).dismissError),
          ],
          const SizedBox(height: AppSpacing.xs),
          TextButton.icon(
            onPressed: () => context.push(AppRoutes.manualCheck),
            icon: const Icon(Iconsax.keyboard),
            label: const Text('Type the NAFDAC number instead'),
          ),
        ],
      ),
    );
  }
}

class _BusyRow extends StatelessWidget {
  const _BusyRow({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 56,
    child: AppShimmer(
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppRadius.pill)),
        child: Text(message, style: context.text.labelLarge),
      ),
    ),
  );
}

class _ErrorRow extends StatelessWidget {
  const _ErrorRow({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Material(
    color: context.palette.dangerContainer,
    borderRadius: BorderRadius.circular(AppRadius.md),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.xs, AppSpacing.xxs, AppSpacing.xs),
      child: Row(
        children: [
          Icon(Iconsax.warning_2, color: context.palette.danger),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(message, style: context.text.bodyMedium)),
          IconButton(onPressed: onDismiss, icon: const Icon(Iconsax.close_circle), tooltip: 'Dismiss'),
        ],
      ),
    ),
  );
}

class _Tips extends StatelessWidget {
  const _Tips();

  static const _tips = [
    (Iconsax.sun_1, 'Good light, no glare across the text'),
    (Iconsax.maximize_4, 'The whole side in the frame, close enough to read'),
    (Iconsax.document_text, 'Include the NAFDAC number, batch and expiry'),
  ];

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final (icon, text) in _tips)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Row(
            children: [
              Icon(icon, color: context.palette.info),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(text, style: context.text.bodyLarge)),
            ],
          ),
        ),
    ],
  );
}
