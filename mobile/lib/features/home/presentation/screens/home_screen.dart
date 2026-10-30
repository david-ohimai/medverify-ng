import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/ai_insight_card.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/quick_action_tile.dart';
import '../../../scan/presentation/providers/scan_providers.dart';
import '../../../scan/presentation/widgets/scan_tile.dart';
import '../providers/home_providers.dart';
import '../widgets/connection_banner.dart';

/// Composition only: each section is its own widget and watches only the
/// provider it needs, so nothing else rebuilds when one section changes.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => RefreshIndicator(
    onRefresh: () => ref.refresh(historyProvider.future),
    child: PageLayout(
      title: ref.watch(greetingProvider),
      subtitle: AppConstants.tagline,
      slivers: [
        const SliverToBoxAdapter(child: ConnectionBanner()),
        const SliverToBoxAdapter(child: _Insights()),
        const SliverToBoxAdapter(child: SectionHeader(title: 'Quick actions')),
        const SliverToBoxAdapter(child: _QuickActions()),
        SliverToBoxAdapter(
          child: SectionHeader(
            title: 'Recent checks',
            action: TextButton(onPressed: () => context.go(AppRoutes.history), child: const Text('See all')),
          ),
        ),
        const SliverToBoxAdapter(child: _RecentScans()),
      ],
    ),
  );
}

class _Insights extends ConsumerWidget {
  const _Insights();

  @override
  Widget build(BuildContext context, WidgetRef ref) => AiInsightCard(lines: ref.watch(homeInsightsProvider));
}

class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: 116,
      child: ListView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        children: [
          QuickActionTile(
            icon: Iconsax.scan_barcode,
            label: 'Scan a pack',
            tint: palette.action,
            onTap: () => context.push(AppRoutes.camera),
          ),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(
            icon: Iconsax.keyboard,
            label: 'NAFDAC no.',
            tint: palette.info,
            onTap: () => context.push(AppRoutes.manualCheck),
          ),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(
            icon: Iconsax.magic_star,
            label: 'Ask MedVerify',
            tint: palette.aiGradient.first,
            onTap: () => context.push(AppRoutes.assistant),
          ),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(
            icon: Iconsax.notification,
            label: 'Alerts near me',
            tint: palette.danger,
            onTap: () => context.go(AppRoutes.alerts),
          ),
        ],
      ),
    );
  }
}

class _RecentScans extends ConsumerWidget {
  const _RecentScans();

  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncValueView(
    value: ref.watch(recentScansProvider),
    loading: const ScanTileSkeleton(),
    onRetry: () => ref.invalidate(historyProvider),
    data: (scans) => scans.isEmpty
        ? const EmptyState(
            icon: Iconsax.receipt_item,
            title: 'Nothing checked yet',
            message: 'Your last few checks will appear here.',
          )
        : Column(children: [for (final scan in scans) ScanTile(scan: scan)]),
  );
}
