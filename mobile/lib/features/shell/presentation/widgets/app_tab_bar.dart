import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../alerts/presentation/providers/alerts_providers.dart';

/// Floating liquid-glass tab bar with a sliding glass pill under the selected
/// tab. Only this widget watches the alert count, so a new alert rebuilds the
/// bar, not the page behind it.
class AppTabBar extends ConsumerWidget {
  const AppTabBar({required this.selectedIndex, required this.onTabSelected, super.key});

  final int selectedIndex;
  final ValueChanged<int> onTabSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertCount = ref.watch(alertBadgeCountProvider);
    final palette = context.palette;

    return GlassTabBar.bottom(
      // Explicit: GlassScaffold hints premium for its bars, and premium
      // overran the frame budget on a mid-range Android phone.
      quality: GlassQuality.standard,
      selectedIndex: selectedIndex,
      onTabSelected: onTabSelected,
      selectedIconColor: palette.action,
      selectedLabelColor: palette.action,
      tabs: [
        const GlassTab(icon: Icon(Iconsax.home_2), activeIcon: Icon(Iconsax.home_2_copy), label: 'Home'),
        const GlassTab(icon: Icon(Iconsax.receipt_item), activeIcon: Icon(Iconsax.receipt_item_copy), label: 'History'),
        const GlassTab(icon: Icon(Iconsax.scan_barcode), activeIcon: Icon(Iconsax.scan_barcode_copy), label: 'Scan'),
        GlassTab(
          icon: _withBadge(const Icon(Iconsax.notification), alertCount),
          activeIcon: _withBadge(const Icon(Iconsax.notification_copy), alertCount),
          label: 'Alerts',
        ),
        const GlassTab(icon: Icon(Iconsax.setting_2), activeIcon: Icon(Iconsax.setting_2_copy), label: 'Settings'),
      ],
    );
  }

  Widget _withBadge(Widget icon, int count) =>
      count > 0 ? GlassBadge(count: count, backgroundColor: const Color(0xFFE74C3C), child: icon) : icon;
}
