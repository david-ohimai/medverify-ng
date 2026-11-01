import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../shared/widgets/app_backdrop.dart';
import '../../../alerts/presentation/providers/alerts_providers.dart';
import '../providers/live_refresh_provider.dart';
import '../widgets/app_tab_bar.dart';

/// The frame around the five tabs: mesh backdrop, the current tab's page, and
/// the floating liquid-glass tab bar. go_router's navigation shell owns which
/// tab is selected.
///
/// Two tabs do a little more than switch:
///  - Scan opens the live scanner straight away (full screen, over the tabs).
///  - Alerts marks what's shown as seen, so the badge clears.
class AppShell extends ConsumerWidget {
  const AppShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const scanTab = 2;
  static const alertsTab = 3;

  void _markAlertsSeen(WidgetRef ref) {
    final alerts = ref.read(nearbyAlertsProvider).value?.alerts;
    if (alerts != null) ref.read(seenAlertsProvider.notifier).markSeen(alerts);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Background refresh on resume and on a timer; it never changes, so this
    // never rebuilds the shell.
    ref.watch(liveRefreshProvider);

    // New alerts arriving while the Alerts tab is open are seen at once.
    ref.listen(nearbyAlertsProvider, (_, _) {
      if (navigationShell.currentIndex == alertsTab) _markAlertsSeen(ref);
    });

    return GlassScaffold(
      background: const AppBackdrop(),
      // The keyboard slides over the tab bar instead of pushing it up with it.
      // The inner Scaffold below still resizes the page, so a focused field
      // (e.g. the regulator PIN) stays visible above the keyboard.
      resizeToAvoidBottomInset: false,
      // GlassScaffold isn't a Material Scaffold, so snack bars shown from a tab
      // (e.g. "Location is turned off") need one to appear in. Transparent, so
      // the backdrop and glass still show through.
      body: Scaffold(backgroundColor: Colors.transparent, body: navigationShell),
      bottomBar: AppTabBar(
        selectedIndex: navigationShell.currentIndex,
        onTabSelected: (index) {
          if (index == alertsTab) _markAlertsSeen(ref);
          // Tapping the current tab again returns it to its first page.
          navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
          // Closing the camera lands on the Scan tab's other options (gallery, type the number).
          if (index == scanTab) context.push(AppRoutes.camera);
        },
      ),
    );
  }
}
