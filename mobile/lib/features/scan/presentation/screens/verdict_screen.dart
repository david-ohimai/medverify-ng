import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../domain/entities/scan_result.dart';
import '../providers/scan_providers.dart';
import '../widgets/listen_card.dart';
import '../widgets/verdict_widgets.dart';

/// One check's result: verdict, review, yours vs genuine, what was read,
/// and every reason. Loaded by id, so it works from History too.
class VerdictScreen extends ConsumerWidget {
  const VerdictScreen({required this.scanId, super.key});

  final String scanId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailScaffold(
    title: 'Result',
    body: AsyncValueView(
      value: ref.watch(scanResultProvider(scanId)),
      loading: const VerdictSkeleton(),
      onRetry: () => ref.invalidate(scanResultProvider(scanId)),
      data: (result) => _VerdictBody(result: result),
    ),
  );
}

class _VerdictBody extends ConsumerWidget {
  const _VerdictBody({required this.result});

  final ScanResult result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final localPhoto = ref.watch(capturedPhotosProvider.select((photos) => photos[result.id]));
    final product = result.product;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.gutter),
      children: [
        if (result.status == ScanStatus.failed) _FailedCard(message: result.advice) else VerdictHero(result: result),
        if (result.status == ScanStatus.done) ...[const SizedBox(height: AppSpacing.md), ListenCard(scanId: result.id)],
        if (result.review != null) ...[const SizedBox(height: AppSpacing.md), ReviewBanner(review: result.review!)],
        if (product?.isDemo ?? false) ...[const SizedBox(height: AppSpacing.md), const DemoNotice()],
        if (result.isPhoto && product != null) ...[
          const SectionHeader(title: 'Yours vs genuine'),
          PackComparison(nafdacNo: product.nafdacNo, localPhoto: localPhoto),
        ],
        if (result.status == ScanStatus.done) ...[
          SectionHeader(title: result.isPhoto ? 'What we read' : 'What you entered'),
          FactsCard(result: result),
          const SectionHeader(title: 'Why we think so'),
          SignalList(signals: result.signals),
        ],
        const SizedBox(height: AppSpacing.md),
        Text(result.disclaimer, style: context.text.bodySmall),
        const SizedBox(height: AppSpacing.xl),
        OutlinedButton.icon(
          onPressed: () => context.push(
            AppRoutes.assistantAsking(
              'I checked ${result.displayName}'
              '${result.nafdacNo == null ? '' : ' (NAFDAC ${result.nafdacNo}${result.batchNo == null ? '' : ', batch ${result.batchNo}'})'}'
              ' and got "${result.headline}". What should I do?',
            ),
          ),
          icon: const Icon(Iconsax.magic_star),
          label: const Text('Ask MedVerify about this'),
        ),
        const SizedBox(height: AppSpacing.sm),
        FilledButton.icon(
          onPressed: () => context.pushReplacement(AppRoutes.camera),
          icon: const Icon(Iconsax.scan_barcode),
          label: const Text('Check another pack'),
        ),
      ],
    );
  }
}

class _FailedCard extends StatelessWidget {
  const _FailedCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Iconsax.camera_slash, color: context.palette.suspicious, size: 32),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Couldn't check this photo", style: context.text.titleMedium),
                const SizedBox(height: AppSpacing.xxs),
                Text(message, style: context.text.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
