import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/ai_insight_card.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/quick_action_tile.dart';
import '../providers/home_providers.dart';
import '../widgets/connection_banner.dart';

/// Composition only: each section is its own widget and watches only the
/// provider it needs, so nothing else rebuilds when one section changes.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => PageLayout(
    title: ref.watch(greetingProvider),
    subtitle: AppConstants.tagline,
    slivers: const [
      SliverToBoxAdapter(child: ConnectionBanner()),
      SliverToBoxAdapter(child: _Insights()),
      SliverToBoxAdapter(child: SectionHeader(title: 'Quick actions')),
      SliverToBoxAdapter(child: _QuickActions()),
      SliverToBoxAdapter(child: SectionHeader(title: 'Recent scans')),
      SliverToBoxAdapter(
        child: EmptyState(
          icon: Iconsax.receipt_item,
          title: 'Nothing scanned yet',
          message: 'Your last few scans will appear here.',
        ),
      ),
    ],
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
            onTap: () => context.go(AppRoutes.scan),
          ),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(icon: Iconsax.keyboard, label: 'NAFDAC no.', tint: palette.info, onTap: null, badge: 'Soon'),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(icon: Iconsax.magic_star, label: 'Ask MedVerify', tint: palette.aiGradient.first, onTap: null, badge: 'Soon'),
          const SizedBox(width: AppSpacing.sm),
          QuickActionTile(icon: Iconsax.flag, label: 'Report a seller', tint: palette.danger, onTap: null, badge: 'Soon'),
        ],
      ),
    );
  }
}
