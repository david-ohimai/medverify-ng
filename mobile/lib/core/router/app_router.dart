import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/alerts/presentation/screens/alerts_screen.dart';
import '../../features/history/presentation/screens/history_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/onboarding/presentation/providers/onboarding_providers.dart';
import '../../features/onboarding/presentation/screens/onboarding_screen.dart';
import '../../features/scan/presentation/screens/scan_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/shell/presentation/screens/app_shell.dart';
import 'app_routes.dart';

/// Created once. Redirects read providers with ref.read, and the router is
/// refreshed when onboarding completes — so the router itself never rebuilds.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(onboardingDoneProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: AppRoutes.home,
    refreshListenable: refresh,
    redirect: (context, state) {
      final onboarded = ref.read(onboardingDoneProvider);
      final atOnboarding = state.matchedLocation == AppRoutes.onboarding;
      if (!onboarded) return atOnboarding ? null : AppRoutes.onboarding;
      if (atOnboarding) return AppRoutes.home;
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.onboarding, builder: (_, _) => const OnboardingScreen()),
      // One navigator per tab: each tab keeps its own stack and scroll position.
      StatefulShellRoute.indexedStack(
        builder: (_, _, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: AppRoutes.home, builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: AppRoutes.history, builder: (_, _) => const HistoryScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: AppRoutes.scan, builder: (_, _) => const ScanScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: AppRoutes.alerts, builder: (_, _) => const AlertsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: AppRoutes.settings, builder: (_, _) => const SettingsScreen())]),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
