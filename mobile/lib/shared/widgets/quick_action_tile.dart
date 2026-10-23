import 'package:flutter/material.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

/// Pastel square tile with a centred icon and label (the "Quick Action" row).
class QuickActionTile extends StatelessWidget {
  const QuickActionTile({
    required this.icon,
    required this.label,
    required this.tint,
    required this.onTap,
    this.badge,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color tint;

  /// Null disables the tile.
  final VoidCallback? onTap;

  /// Small text in the corner, e.g. "Soon".
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Material(
        color: tint.withValues(alpha: context.isDark ? 0.18 : 0.12),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          onTap: onTap,
          child: SizedBox(
            width: 128,
            height: 116,
            child: Stack(
              children: [
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 30, color: tint),
                      const SizedBox(height: AppSpacing.sm),
                      Text(label, textAlign: TextAlign.center, style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                if (badge != null)
                  Positioned(
                    top: AppSpacing.xs,
                    right: AppSpacing.xs,
                    child: Text(badge!, style: context.text.labelSmall),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
