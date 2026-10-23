import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

class ErrorView extends StatelessWidget {
  const ErrorView({required this.message, this.onRetry, super.key});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(AppSpacing.lg),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Iconsax.warning_2, size: 32, color: context.palette.danger),
        const SizedBox(height: AppSpacing.sm),
        Text(message, textAlign: TextAlign.center, style: context.text.bodyMedium),
        if (onRetry != null) ...[
          const SizedBox(height: AppSpacing.sm),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ],
    ),
  );
}
