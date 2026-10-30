import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../domain/entities/scan_result.dart';
import 'verdict_style.dart';

/// One past check in a list (History, Home). Taps through to its result.
class ScanTile extends StatelessWidget {
  const ScanTile({required this.scan, super.key});

  final ScanResult scan;

  static String _when(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes} min ago';
    if (diff.inDays < 1) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';
    return '${at.day}/${at.month}/${at.year}';
  }

  @override
  Widget build(BuildContext context) {
    final style = VerdictStyle.of(scan.verdict, context.palette);
    final subtitle = [
      scan.isPhoto ? 'Photo' : 'Typed in',
      if (scan.nafdacNo != null) scan.nafdacNo!,
      _when(scan.checkedAt),
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(AppRoutes.scanResult(scan.id)),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: style.container, borderRadius: BorderRadius.circular(AppRadius.sm)),
                  child: Icon(scan.status == ScanStatus.failed ? Iconsax.camera_slash : style.icon, color: style.color),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(scan.displayName, style: context.text.titleSmall, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(subtitle, style: context.text.bodySmall, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  scan.status == ScanStatus.failed ? 'Retake' : style.label,
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

/// Shimmer rows shaped like [ScanTile].
class ScanTileSkeleton extends StatelessWidget {
  const ScanTileSkeleton({this.count = 3, super.key});

  final int count;

  @override
  Widget build(BuildContext context) => AppShimmer(
    child: Column(
      children: [
        for (var i = 0; i < count; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpacing.sm),
            child: ShimmerBox(height: 80, radius: AppRadius.lg),
          ),
      ],
    ),
  );
}
