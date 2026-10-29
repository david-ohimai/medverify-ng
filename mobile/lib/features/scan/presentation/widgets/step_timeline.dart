import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../domain/entities/scan_progress.dart';

/// "Watch the AI think": each pipeline step ticks as the server reports it.
/// The active step shimmers; skipped steps are dimmed with their reason.
class StepTimeline extends StatelessWidget {
  const StepTimeline({required this.steps, super.key});

  final List<StepView> steps;

  @override
  Widget build(BuildContext context) => Column(
    children: [for (var i = 0; i < steps.length; i++) _StepRow(step: steps[i], last: i == steps.length - 1)],
  );
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step, required this.last});

  final StepView step;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = switch (step.state) {
      StepStatus.done => palette.genuine,
      StepStatus.active => palette.action,
      StepStatus.skipped || StepStatus.waiting => context.colors.onSurfaceVariant.withValues(alpha: 0.5),
    };
    final icon = switch (step.state) {
      StepStatus.done => Icon(Iconsax.tick_circle_copy, color: color, size: 26),
      StepStatus.active => AppShimmer(child: Icon(Iconsax.record_circle_copy, color: color, size: 26)),
      StepStatus.skipped => Icon(Iconsax.minus_cirlce, color: color, size: 26),
      StepStatus.waiting => Icon(Iconsax.record_circle, color: color, size: 26),
    };
    final label = Text(
      step.label,
      style: context.text.titleSmall?.copyWith(
        color: step.state == StepStatus.waiting || step.state == StepStatus.skipped ? color : null,
        fontWeight: step.state == StepStatus.active ? FontWeight.w700 : FontWeight.w500,
      ),
    );

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              icon,
              if (!last)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
                    color: step.state == StepStatus.done
                        ? palette.genuine.withValues(alpha: 0.4)
                        : context.colors.outline,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 2, bottom: AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (step.state == StepStatus.active) AppShimmer(child: label) else label,
                  if (step.detail != null) ...[
                    const SizedBox(height: 2),
                    Text(step.detail!, style: context.text.bodySmall),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
