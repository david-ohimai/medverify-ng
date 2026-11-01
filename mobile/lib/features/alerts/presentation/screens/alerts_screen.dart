import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/location/location_service.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../../../core/errors/failure.dart';
import '../../data/alerts_repository.dart';
import '../providers/alerts_providers.dart';

/// Warnings near the user: clusters of suspicious scans found by the
/// hotspot job, with the product, batch and area.
class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => RefreshIndicator(
    // Optional: alerts also refresh on their own, keeping the chosen place.
    onRefresh: () => ref.read(nearbyAlertsProvider.notifier).refresh(),
    child: const PageLayout(
      title: 'Alerts',
      subtitle: 'Suspicious medicines reported near you',
      slivers: [
        SliverToBoxAdapter(child: _PlacePicker()),
        SliverToBoxAdapter(child: SizedBox(height: AppSpacing.lg)),
        SliverToBoxAdapter(child: _AlertList()),
      ],
    ),
  );
}

class _PlacePicker extends ConsumerWidget {
  const _PlacePicker();

  /// Says why there's no location and offers the settings page that fixes it.
  Future<void> _useMyLocation(BuildContext context, WidgetRef ref) async {
    final problem = await ref.read(nearbyAlertsProvider.notifier).useMyLocation();
    if (problem == null || !context.mounted) return;
    final location = ref.read(locationServiceProvider);
    final messenger = ScaffoldMessenger.of(context)..removeCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(problem.message),
        duration: const Duration(seconds: 6),
        action: problem.fixableInLocationSettings
            ? SnackBarAction(label: 'Turn on', onPressed: location.openLocationSettings)
            : problem.fixableInAppSettings
            ? SnackBarAction(label: 'Settings', onPressed: location.openAppSettings)
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(nearbyAlertsProvider.select((s) => s.value));
    final locating = ref.watch(nearbyAlertsProvider.select((s) => s.isLoading));
    final controller = ref.read(nearbyAlertsProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton.icon(
          onPressed: locating ? null : () => _useMyLocation(context, ref),
          icon: Icon(current?.usingLocation ?? false ? Iconsax.location_tick : Iconsax.location),
          label: Text(
            locating
                ? 'Finding your area…'
                : current?.usingLocation ?? false
                ? 'Using your area (about 1 km)'
                : 'Use my location',
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        PillTabs(
          labels: [for (final city in City.values) city.label],
          selected: current?.city?.index ?? -1,
          onSelected: (i) => controller.selectCity(City.values[i]),
        ),
      ],
    );
  }
}

class _AlertList extends ConsumerWidget {
  const _AlertList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(nearbyAlertsProvider);
    if (value.isLoading && !value.hasValue) return const _AlertSkeleton();
    if (value.hasError && !value.hasValue) {
      final error = value.error;
      return ErrorView(
        message: error is Failure ? error.message : 'Could not load alerts.',
        onRetry: () => ref.invalidate(nearbyAlertsProvider),
      );
    }
    final data = value.requireValue;
    if (data.alerts.isEmpty) {
      return EmptyState(
        icon: Iconsax.shield_tick,
        title: 'No warnings ${data.usingLocation ? 'near you' : 'in ${data.place}'}',
        message: 'When several suspicious scans cluster in one area, a warning appears here.',
      );
    }
    return Column(
      children: [
        if (value.isLoading) const LinearProgressIndicator(minHeight: 2),
        for (final alert in data.alerts) _AlertCard(alert: alert),
        if (data.alerts.any((a) => a.includesSimulatedData))
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text('Includes simulated pilot data.', style: context.text.bodySmall),
          ),
      ],
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert});

  final NearbyAlert alert;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (color, container) = switch (alert.severity) {
      'high' => (palette.danger, palette.dangerContainer),
      'medium' => (palette.suspicious, palette.suspiciousContainer),
      _ => (palette.info, palette.info.withValues(alpha: 0.12)),
    };
    final facts = [
      if (alert.productName != null) alert.productName!,
      if (alert.batchNo != null) 'batch ${alert.batchNo}',
      if (alert.nafdacNo != null) 'NAFDAC ${alert.nafdacNo}',
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: GlassCard(
        padding: const EdgeInsets.all(AppSpacing.lg),
        shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
                  decoration: BoxDecoration(color: container, borderRadius: BorderRadius.circular(AppRadius.pill)),
                  child: Text(
                    alert.recallInvolved ? 'RECALLED BATCH' : alert.severity.toUpperCase(),
                    style: context.text.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w900),
                  ),
                ),
                const Spacer(),
                Icon(Iconsax.location, size: 16, color: context.colors.onSurfaceVariant),
                const SizedBox(width: AppSpacing.xxs),
                Text('${alert.distanceKm.toStringAsFixed(1)} km', style: context.text.labelMedium),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(alert.title ?? 'Suspicious scans reported', style: context.text.titleMedium),
            if (facts.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xxs),
              Text(facts, style: context.text.bodyMedium),
            ],
            if (alert.areaName != null) ...[
              const SizedBox(height: AppSpacing.xxs),
              Text(alert.areaName!, style: context.text.bodySmall),
            ],
            if (alert.isDemoProduct) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Demo product — fictional data',
                style: context.text.labelSmall?.copyWith(color: palette.suspicious),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AlertSkeleton extends StatelessWidget {
  const _AlertSkeleton();

  @override
  Widget build(BuildContext context) => AppShimmer(
    child: Column(
      children: [
        for (var i = 0; i < 3; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpacing.md),
            child: ShimmerBox(height: 130, radius: AppRadius.lg),
          ),
      ],
    ),
  );
}
