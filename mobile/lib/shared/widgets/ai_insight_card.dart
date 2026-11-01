import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';
import 'shimmer/app_shimmer.dart';

enum InsightTone { neutral, info, warning, danger }

class InsightLine {
  const InsightLine({required this.icon, required this.text, this.tone = InsightTone.neutral});

  final IconData icon;
  final String text;
  final InsightTone tone;
}

/// The "✨ AI Insight" card from the reference design, on liquid glass.
class AiInsightCard extends StatelessWidget {
  const AiInsightCard({required this.lines, super.key});

  final List<InsightLine> lines;

  @override
  Widget build(BuildContext context) => GlassContainer.card(
    padding: const EdgeInsets.all(AppSpacing.lg),
    shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.lg),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AiPill(),
        const SizedBox(height: AppSpacing.md),
        for (final line in lines) _InsightRow(line: line),
      ],
    ),
  );
}

class _InsightRow extends StatelessWidget {
  const _InsightRow({required this.line});

  final InsightLine line;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = switch (line.tone) {
      InsightTone.neutral => context.colors.onSurface,
      InsightTone.info => palette.info,
      InsightTone.warning => palette.suspicious,
      InsightTone.danger => palette.danger,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(line.icon, size: 22, color: color),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(line.text, style: context.text.bodyLarge?.copyWith(color: color)),
          ),
        ],
      ),
    );
  }
}

/// Gradient "✨ AI Insight" label. Reused wherever AI produced the content.
class AiPill extends StatelessWidget {
  const AiPill({this.label = 'AI Insight', super.key});

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: context.palette.aiLinearGradient,
      borderRadius: BorderRadius.circular(AppRadius.pill),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Iconsax.magic_star, size: 16, color: Colors.white),
          const SizedBox(width: AppSpacing.xs),
          Text(
            label,
            style: context.text.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    ),
  );
}

/// Shimmer placeholder with the same shape as [AiInsightCard].
class AiInsightCardSkeleton extends StatelessWidget {
  const AiInsightCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: AppShimmer(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ShimmerBox(width: 120, height: 32, radius: AppRadius.pill),
            const SizedBox(height: AppSpacing.md),
            for (var i = 0; i < 3; i++) ...[
              ShimmerLine(widthFactor: i.isEven ? 0.95 : 0.7),
              const SizedBox(height: AppSpacing.sm),
            ],
          ],
        ),
      ),
    ),
  );
}
