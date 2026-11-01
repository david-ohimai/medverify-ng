import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../../scan/presentation/widgets/verdict_style.dart';
import '../../domain/regulator_models.dart';
import '../providers/regulator_providers.dart';

/// Which queue tab is open.
final reviewTabProvider = NotifierProvider.autoDispose<ReviewTab, int>(ReviewTab.new);

class ReviewTab extends Notifier<int> {
  static const statuses = ['open', 'claimed', 'decided'];

  @override
  int build() => 0;

  void select(int index) => state = index;
}

/// Photo scans waiting for a human: escalated first, then most urgent,
/// then nearest deadline (the server orders them).
class ReviewQueueScreen extends ConsumerWidget {
  const ReviewQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(reviewTabProvider);
    final status = ReviewTab.statuses[tab];
    return DetailScaffold(
      title: 'Review queue',
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(reviewQueueProvider(status).future),
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.gutter),
          children: [
            PillTabs(
              labels: const ['Waiting', 'In progress', 'Decided'],
              selected: tab,
              onSelected: ref.read(reviewTabProvider.notifier).select,
            ),
            const SizedBox(height: AppSpacing.md),
            AsyncValueView(
              value: ref.watch(reviewQueueProvider(status)),
              onRetry: () => ref.invalidate(reviewQueueProvider(status)),
              loading: AppShimmer(
                child: Column(
                  children: [
                    for (var i = 0; i < 4; i++)
                      const Padding(
                        padding: EdgeInsets.only(bottom: AppSpacing.sm),
                        child: ShimmerBox(height: 92, radius: AppRadius.lg),
                      ),
                  ],
                ),
              ),
              data: (items) => items.isEmpty
                  ? const EmptyState(
                      icon: Iconsax.task_square,
                      title: 'Nothing here',
                      message: 'Risky or doubtful photo scans are queued here automatically.',
                    )
                  : Column(children: [for (final item in items) _ReviewTile(item: item)]),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.item});

  final ReviewItem item;

  static String _due(ReviewItem item) {
    if (item.decided) return item.decision == null ? 'Decided' : 'Decided: ${item.decision}';
    final left = item.slaDeadline.difference(DateTime.now());
    if (left.isNegative) return 'Overdue by ${(-left.inMinutes / 60).toStringAsFixed(1)} h';
    return left.inHours >= 1 ? 'Due in ${left.inHours} h' : 'Due in ${left.inMinutes} min';
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final style = VerdictStyle.of(item.verdict, palette);
    final priorityColor = switch (item.priority) {
      1 => palette.danger,
      2 => palette.suspicious,
      _ => palette.info,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(AppRoutes.review(item.id)),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: priorityColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Text(
                    'P${item.priority}',
                    style: context.text.titleMedium?.copyWith(color: priorityColor, fontWeight: FontWeight.w900),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        [
                          item.productName ?? 'Unknown product',
                          if (item.batchNo != null) 'batch ${item.batchNo}',
                        ].join(' · '),
                        style: context.text.titleSmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.reasons.map((r) => r.toLowerCase().replaceAll('_', ' ')).join(', '),
                        style: context.text.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _due(item) + (item.escalationLevel > 0 ? ' · escalated ×${item.escalationLevel}' : ''),
                        style: context.text.labelSmall?.copyWith(
                          color: item.overdue ? palette.danger : context.colors.onSurfaceVariant,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  style.label,
                  style: context.text.labelMedium?.copyWith(color: style.color, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
