import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../domain/regulator_models.dart';
import '../providers/regulator_providers.dart';

/// The regulator's overview: stat cards, the review queue at a glance,
/// "Ask the data", and every active hotspot with its AI-written alert.
class RegulatorDashboardScreen extends ConsumerWidget {
  const RegulatorDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailScaffold(
    title: 'Regulator dashboard',
    body: RefreshIndicator(
      onRefresh: () async {
        ref
          ..invalidate(hotspotStatsProvider)
          ..invalidate(hotspotsProvider)
          ..invalidate(reviewStatsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.gutter),
        children: const [
          _Stats(),
          SectionHeader(title: 'Review queue'),
          _ReviewSummary(),
          SizedBox(height: AppSpacing.sm),
          _AskTheData(),
          SectionHeader(title: 'Active hotspots'),
          _Hotspots(),
        ],
      ),
    ),
  );
}

class _Stats extends ConsumerWidget {
  const _Stats();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final window = ref.watch(statsWindowProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PillTabs(
          labels: const ['24 hours', '7 days', '30 days'],
          selected: StatsWindow.windows.indexOf(window),
          onSelected: (i) => ref.read(statsWindowProvider.notifier).select(StatsWindow.windows[i]),
        ),
        const SizedBox(height: AppSpacing.md),
        AsyncValueView(
          value: ref.watch(hotspotStatsProvider(window)),
          loading: const AppShimmer(child: ShimmerBox(height: 172, radius: AppRadius.lg)),
          onRetry: () => ref.invalidate(hotspotStatsProvider(window)),
          data: (stats) {
            final palette = context.palette;
            return Column(
              children: [
                Row(
                  children: [
                    _StatCard(label: 'Checks', value: stats.scans, color: palette.info),
                    const SizedBox(width: AppSpacing.sm),
                    _StatCard(label: 'Flagged', value: stats.flagged, color: palette.suspicious),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    _StatCard(label: 'High risk', value: stats.highRisk, color: palette.danger),
                    const SizedBox(width: AppSpacing.sm),
                    _StatCard(label: 'Hotspots', value: stats.activeHotspots, color: palette.action),
                  ],
                ),
                if (stats.includesSimulatedData)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: Text('Includes simulated pilot data.', style: context.text.bodySmall),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.color});

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$value',
            style: context.text.headlineMedium?.copyWith(color: color, fontWeight: FontWeight.w900),
          ),
          Text(label, style: context.text.bodyMedium),
        ],
      ),
    ),
  );
}

class _ReviewSummary extends ConsumerWidget {
  const _ReviewSummary();

  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncValueView(
    value: ref.watch(reviewStatsProvider),
    loading: const AppShimmer(child: ShimmerBox(height: 76, radius: AppRadius.lg)),
    onRetry: () => ref.invalidate(reviewStatsProvider),
    data: (stats) => Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
        leading: Icon(Iconsax.task_square, color: context.palette.action),
        title: Text('${stats.open} waiting · ${stats.urgent} urgent', style: context.text.titleSmall),
        subtitle: Text(
          [
            if (stats.overdue > 0) '${stats.overdue} overdue',
            if (stats.agreementRate != null) 'reviewers agree with the system ${stats.agreementRate}%',
          ].join(' · ').ifEmpty('Nothing overdue'),
        ),
        trailing: const Icon(Iconsax.arrow_right_3),
        onTap: () => context.push(AppRoutes.reviewQueue),
      ),
    ),
  );
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _AskTheData extends StatelessWidget {
  const _AskTheData();

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: () => context.push(AppRoutes.assistantAsking('Which hotspots should inspectors visit first this week?')),
    icon: const Icon(Iconsax.magic_star),
    label: const Text('Ask the data'),
  );
}

class _Hotspots extends ConsumerWidget {
  const _Hotspots();

  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncValueView(
    value: ref.watch(hotspotsProvider),
    loading: const AppShimmer(
      child: Column(
        children: [
          ShimmerBox(height: 160, radius: AppRadius.lg),
          SizedBox(height: AppSpacing.md),
          ShimmerBox(height: 160, radius: AppRadius.lg),
        ],
      ),
    ),
    onRetry: () => ref.invalidate(hotspotsProvider),
    data: (hotspots) => hotspots.isEmpty
        ? const EmptyState(
            icon: Iconsax.map,
            title: 'No active hotspots',
            message: 'Clusters of suspicious scans in the last 7 days appear here.',
          )
        : Column(children: [for (final hotspot in hotspots) _HotspotCard(hotspot: hotspot)]),
  );
}

class _HotspotCard extends StatelessWidget {
  const _HotspotCard({required this.hotspot});

  final Hotspot hotspot;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (color, container) = switch (hotspot.severity) {
      'high' => (palette.danger, palette.dangerContainer),
      'medium' => (palette.suspicious, palette.suspiciousContainer),
      _ => (palette.info, palette.info.withValues(alpha: 0.12)),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
                    decoration: BoxDecoration(color: container, borderRadius: BorderRadius.circular(AppRadius.pill)),
                    child: Text(
                      hotspot.severity.toUpperCase(),
                      style: context.text.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w900),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(child: Text(hotspot.areaName ?? 'Unnamed area', style: context.text.titleSmall)),
                  Text('${hotspot.scanCount} scans', style: context.text.labelMedium),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(hotspot.alertTitle ?? 'Suspicious scans clustered here', style: context.text.titleMedium),
              if (hotspot.alertBody != null) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(hotspot.alertBody!, style: context.text.bodyMedium),
              ],
              if (hotspot.recommendedAction != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Iconsax.flag, size: 18, color: palette.action),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(child: Text(hotspot.recommendedAction!, style: context.text.bodyMedium)),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              Text(
                [
                  if (hotspot.productName != null) hotspot.productName!,
                  if (hotspot.batchNo != null) 'batch ${hotspot.batchNo}',
                  'within ${(hotspot.radiusM / 1000).toStringAsFixed(1)} km',
                  if (hotspot.includesSimulatedData) 'includes simulated data',
                ].join(' · '),
                style: context.text.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
