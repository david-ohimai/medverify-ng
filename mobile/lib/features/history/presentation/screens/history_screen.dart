import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../scan/presentation/providers/scan_providers.dart';
import '../../../scan/presentation/widgets/scan_tile.dart';

/// Every check this device has made, newest first. Pull to refresh; the next
/// page loads as the list nears its end.
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => RefreshIndicator(
    onRefresh: () => ref.refresh(historyProvider.future),
    child: NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.extentAfter < 400) ref.read(historyProvider.notifier).loadMore();
        return false;
      },
      child: const PageLayout(
        title: 'History',
        subtitle: 'Every pack you have checked',
        slivers: [SliverToBoxAdapter(child: _HistoryList())],
      ),
    ),
  );
}

class _HistoryList extends ConsumerWidget {
  const _HistoryList();

  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncValueView(
    value: ref.watch(historyProvider),
    loading: const ScanTileSkeleton(count: 6),
    onRetry: () => ref.invalidate(historyProvider),
    data: (page) => page.items.isEmpty
        ? EmptyState(
            icon: Iconsax.receipt_item,
            title: 'No checks yet',
            message: 'Scan a pack or type a NAFDAC number — every result is saved here.',
            action: FilledButton(onPressed: () => context.push(AppRoutes.camera), child: const Text('Scan a pack')),
          )
        : Column(
            children: [
              for (final scan in page.items) ScanTile(scan: scan),
              if (page.loadingMore) const ScanTileSkeleton(count: 2),
            ],
          ),
  );
}
