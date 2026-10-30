import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/theme/app_palette.dart';
import '../../domain/entities/scan_result.dart';

/// How each verdict looks, in one place. The words never say "safe".
class VerdictStyle {
  const VerdictStyle({required this.color, required this.container, required this.icon, required this.label});

  final Color color;
  final Color container;
  final IconData icon;
  final String label;

  static VerdictStyle of(Verdict? verdict, AppPalette palette) => switch (verdict) {
    Verdict.likelyGenuine => VerdictStyle(
      color: palette.genuine,
      container: palette.genuineContainer,
      icon: Iconsax.shield_tick,
      label: 'Likely genuine',
    ),
    Verdict.suspicious => VerdictStyle(
      color: palette.suspicious,
      container: palette.suspiciousContainer,
      icon: Iconsax.warning_2,
      label: 'Suspicious',
    ),
    Verdict.highRisk => VerdictStyle(
      color: palette.danger,
      container: palette.dangerContainer,
      icon: Iconsax.danger,
      label: 'High risk',
    ),
    Verdict.unregistered => VerdictStyle(
      color: palette.danger,
      container: palette.dangerContainer,
      icon: Iconsax.close_circle,
      label: 'Not registered',
    ),
    null => VerdictStyle(
      color: palette.info,
      container: palette.info.withValues(alpha: 0.12),
      icon: Iconsax.clock,
      label: 'Checking',
    ),
  };

  static Color severityColor(SignalSeverity severity, AppPalette palette) => switch (severity) {
    SignalSeverity.good => palette.genuine,
    SignalSeverity.info => palette.info,
    SignalSeverity.warning => palette.suspicious,
    SignalSeverity.danger => palette.danger,
  };

  static IconData severityIcon(SignalSeverity severity) => switch (severity) {
    SignalSeverity.good => Iconsax.tick_circle,
    SignalSeverity.info => Iconsax.info_circle,
    SignalSeverity.warning => Iconsax.warning_2,
    SignalSeverity.danger => Iconsax.danger,
  };
}
