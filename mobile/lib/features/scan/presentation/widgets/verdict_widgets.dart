import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../domain/entities/scan_result.dart';
import '../providers/scan_providers.dart';
import 'verdict_style.dart';

/// The big coloured verdict card: icon, verdict, headline, advice, risk score.
class VerdictHero extends StatelessWidget {
  const VerdictHero({required this.result, super.key});

  final ScanResult result;

  @override
  Widget build(BuildContext context) {
    final style = VerdictStyle.of(result.verdict, context.palette);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: style.container,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: style.color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(style.icon, color: style.color, size: 36),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  style.label.toUpperCase(),
                  style: context.text.labelLarge?.copyWith(
                    color: style.color,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
                  ),
                ),
              ),
              if (result.riskScore != null) _ScoreRing(score: result.riskScore!, color: style.color),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(result.headline, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.xs),
          Text(result.advice, style: context.text.bodyLarge),
          if (result.confidence != null) ...[
            const SizedBox(height: AppSpacing.md),
            _ConfidenceChip(confidence: result.confidence!),
          ],
        ],
      ),
    );
  }
}

class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.score, required this.color});

  final int score;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Risk score $score out of 100',
    child: SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: score / 100,
            strokeWidth: 6,
            color: color,
            backgroundColor: color.withValues(alpha: 0.15),
            strokeCap: StrokeCap.round,
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$score',
                style: context.text.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w900),
              ),
              Text('risk', style: context.text.labelSmall?.copyWith(color: color)),
            ],
          ),
        ],
      ),
    ),
  );
}

class _ConfidenceChip extends StatelessWidget {
  const _ConfidenceChip({required this.confidence});

  final Confidence confidence;

  @override
  Widget build(BuildContext context) {
    final (label, hint) = switch (confidence) {
      Confidence.high => ('High confidence', 'Clear evidence behind this result'),
      Confidence.medium => ('Medium confidence', 'Show it to a pharmacist if in doubt'),
      Confidence.low => ('Low confidence', 'Not enough to be sure — check with a pharmacist'),
    };
    return Row(
      children: [
        Icon(Iconsax.chart_2, size: 18, color: context.colors.onSurfaceVariant),
        const SizedBox(width: AppSpacing.xs),
        Text(label, style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text('· $hint', style: context.text.bodySmall, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }
}

/// A pharmacist reviewed (or will review) this scan.
class ReviewBanner extends StatelessWidget {
  const ReviewBanner({required this.review, super.key});

  final ScanReview review;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Material(
      color: palette.aiContainer,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(review.decided ? Iconsax.user_tick : Iconsax.user_search, color: palette.aiGradient.first),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(review.message, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  if (review.note != null) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text('“${review.note}”', style: context.text.bodyMedium),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fictional demo data must never pass as a real registration.
class DemoNotice extends StatelessWidget {
  const DemoNotice({super.key});

  @override
  Widget build(BuildContext context) => Material(
    color: context.palette.suspiciousContainer,
    borderRadius: BorderRadius.circular(AppRadius.md),
    child: Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Icon(Iconsax.info_circle, color: context.palette.suspicious),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Demo product — fictional test data, not a real NAFDAC registration.',
              style: context.text.bodyMedium,
            ),
          ),
        ],
      ),
    ),
  );
}

/// "Yours vs genuine": the photo just taken beside the genuine pack.
class PackComparison extends ConsumerWidget {
  const PackComparison({required this.nafdacNo, required this.localPhoto, super.key});

  final String nafdacNo;

  /// The photo on this phone, when the scan was taken in this session.
  final String? localPhoto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reference = ref.watch(referenceImageProvider(nafdacNo));
    // Nothing to show side by side without a reference photo.
    if (reference.value == null && !reference.isLoading) return const SizedBox.shrink();

    Widget frame(String label, Widget image) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: AspectRatio(aspectRatio: 4 / 3, child: image),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(label, style: context.text.labelLarge),
        ],
      ),
    );

    final genuine = switch (reference) {
      AsyncData(:final value?) => Image.memory(value, fit: BoxFit.cover, cacheWidth: 600),
      _ => const AppShimmer(child: ShimmerBox(height: double.infinity)),
    };

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (localPhoto != null) ...[
          frame('Your pack', Image.file(File(localPhoto!), fit: BoxFit.cover, cacheWidth: 600)),
          const SizedBox(width: AppSpacing.sm),
        ],
        frame('Genuine pack', genuine),
      ],
    );
  }
}

/// What was read off the pack (or typed in).
class FactsCard extends StatelessWidget {
  const FactsCard({required this.result, super.key});

  final ScanResult result;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('NAFDAC no.', result.nafdacNo),
      ('Name on pack', result.productName),
      (
        'Registered as',
        result.product == null ? null : '${result.product!.brandName} · ${result.product!.genericName}',
      ),
      ('Batch', result.batchNo),
      ('Expiry', result.expiry),
      ('Area', result.areaName),
    ].where((row) => row.$2 != null).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
        child: Column(
          children: [
            for (final (label, value) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 120, child: Text(label, style: context.text.bodyMedium)),
                    Expanded(
                      child: Text(value!, style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "Why we think so": every signal with its weight.
class SignalList extends StatelessWidget {
  const SignalList({required this.signals, super.key});

  final List<ScanSignal> signals;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      children: [
        for (final signal in signals)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  VerdictStyle.severityIcon(signal.severity),
                  color: VerdictStyle.severityColor(signal.severity, palette),
                  size: 22,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(signal.label, style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                      if (signal.detail != null) Text(signal.detail!, style: context.text.bodyMedium),
                    ],
                  ),
                ),
                if (signal.weight != 0)
                  Text(
                    signal.weight > 0 ? '+${signal.weight}' : '${signal.weight}',
                    style: context.text.labelLarge?.copyWith(
                      color: signal.weight > 0 ? palette.danger : palette.genuine,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Shimmer placeholder shaped like the verdict page.
class VerdictSkeleton extends StatelessWidget {
  const VerdictSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(AppSpacing.gutter),
    child: AppShimmer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ShimmerBox(height: 200, radius: AppRadius.lg),
          SizedBox(height: AppSpacing.xl),
          ShimmerLine(widthFactor: 0.5, height: 20),
          SizedBox(height: AppSpacing.md),
          ShimmerBox(height: 140, radius: AppRadius.lg),
          SizedBox(height: AppSpacing.xl),
          ShimmerLine(widthFactor: 0.9),
          SizedBox(height: AppSpacing.sm),
          ShimmerLine(widthFactor: 0.7),
        ],
      ),
    ),
  );
}
