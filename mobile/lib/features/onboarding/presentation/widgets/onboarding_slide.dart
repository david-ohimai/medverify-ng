import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';

class OnboardingSlide extends StatelessWidget {
  const OnboardingSlide({required this.icon, required this.title, required this.message, this.child, super.key});

  final IconData icon;
  final String title;
  final String message;
  final Widget? child;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.gutter, vertical: AppSpacing.xxl),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassContainer(
          width: 88,
          height: 88,
          shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.lg),
          child: Center(child: Icon(icon, size: 40, color: context.palette.action)),
        ),
        const SizedBox(height: AppSpacing.xl),
        Text(title, style: context.text.headlineLarge),
        const SizedBox(height: AppSpacing.sm),
        Text(message, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
        if (child != null) ...[const SizedBox(height: AppSpacing.xl), child!],
      ],
    ),
  );
}
