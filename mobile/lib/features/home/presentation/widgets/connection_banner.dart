import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../session/presentation/providers/session_providers.dart';

/// Shown only when silent registration failed (usually no internet).
/// Nothing is shown while it is loading or once it has succeeded.
class ConnectionBanner extends ConsumerWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final error = ref.watch(sessionControllerProvider.select((s) => s.error));
    if (error == null) return const SizedBox.shrink();

    final palette = context.palette;
    final message = error is Failure ? error.message : 'Could not reach MedVerify.';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Material(
        color: palette.suspiciousContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.xs, AppSpacing.sm),
          child: Row(
            children: [
              Icon(Iconsax.wifi_square, color: palette.suspicious),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(message, style: context.text.bodyMedium)),
              TextButton(
                onPressed: () => ref.read(sessionControllerProvider.notifier).retry(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
