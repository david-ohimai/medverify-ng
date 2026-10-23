import 'package:flutter/material.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({required this.icon, required this.title, required this.message, this.action, super.key});

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.xxl),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: context.palette.actionContainer,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Icon(icon, size: 32, color: context.palette.action),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(title, textAlign: TextAlign.center, style: context.text.titleLarge),
        const SizedBox(height: AppSpacing.xs),
        Text(message, textAlign: TextAlign.center, style: context.text.bodyMedium),
        if (action != null) ...[const SizedBox(height: AppSpacing.lg), action!],
      ],
    ),
  );
}
