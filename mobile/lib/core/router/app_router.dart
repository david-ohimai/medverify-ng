import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/alerts/presentation/screens/alerts_screen.dart';
import '../../features/assistant/presentation/screens/assistant_screen.dart';
import '../../features/history/presentation/screens/history_screen.dart';
import '../../features/home/presentation/providers/home_providers.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/onboarding/presentation/providers/onboarding_providers.dart';
import '../../features/onboarding/presentation/screens/onboarding_screen.dart';
import '../../features/regulator/presentation/screens/regulator_dashboard_screen.dart';
import '../../features/regulator/presentation/screens/review_queue_screen.dart';
import '../../features/regulator/presentation/screens/review_screen.dart';
import '../../features/scan/presentation/screens/manual_check_screen.dart';
import '../../features/scan/presentation/screens/scan_progress_screen.dart';
import '../../features/scan/presentation/screens/scan_screen.dart';
import '../../features/scan/presentation/screens/scanner_screen.dart';
import '../../features/scan/presentation/screens/verdict_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/shell/presentation/screens/app_shell.dart';
import '../../features/splash/presentation/providers/splash_providers.dart';
import '../../features/splash/presentation/screens/splash_screen.dart';
import 'app_routes.dart';

/// Created once. Redirects read providers with ref.read, and the router is
/// refreshed when onboarding completes — so the router itself never rebuilds.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(onboardingDoneProvider, (_, _) => refresh.value++)
    ..listen(splashDoneProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final location = state.matchedLocation;
      // The splash plays first, then hands over to onboarding or home.
      if (!ref.read(splashDoneProvider)) return location == AppRoutes.splash ? null : AppRoutes.splash;
      final onboarded = ref.read(onboardingDoneProvider);
      if (!onboarded) return location == AppRoutes.onboarding ? null : AppRoutes.onboarding;
      if (location == AppRoutes.onboarding || location == AppRoutes.splash) return AppRoutes.home;
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        // A fade, not a slide, from the splash into the app.
        pageBuilder: (_, state) => NoTransitionPage(key: state.pageKey, child: const SplashScreen()),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        pageBuilder: (_, state) => CustomTransitionPage(
          key: state.pageKey,
          transitionDuration: const Duration(milliseconds: 400),
          transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
          child: const OnboardingScreen(),
        ),
      ),
      // Full-screen pages over the tabs (the tab bar hides while they are open).
      GoRoute(
        path: AppRoutes.scanProgressPattern,
        builder: (_, state) => ScanProgressScreen(scanId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: AppRoutes.scanResultPattern,
        builder: (_, state) => VerdictScreen(scanId: state.pathParameters['id']!),
      ),
      GoRoute(path: AppRoutes.manualCheck, builder: (_, _) => const ManualCheckScreen()),
      GoRoute(path: AppRoutes.regulator, builder: (_, _) => const RegulatorDashboardScreen()),
      GoRoute(path: AppRoutes.reviewQueue, builder: (_, _) => const ReviewQueueScreen()),
      GoRoute(
        path: AppRoutes.reviewPattern,
        builder: (_, state) => ReviewScreen(reviewId: state.pathParameters['id']!),
      ),
      GoRoute(path: AppRoutes.camera, builder: (_, _) => const ScannerScreen()),
      GoRoute(
        path: AppRoutes.assistant,
        builder: (_, state) => AssistantScreen(initialQuestion: state.uri.queryParameters['q']),
      ),
      // One navigator per tab: each tab keeps its own stack and scroll position.
      StatefulShellRoute.indexedStack(
        builder: (_, _, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.home, builder: (_, _) => const HomeScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.history, builder: (_, _) => const HistoryScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.scan, builder: (_, _) => const ScanScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.alerts, builder: (_, _) => const AlertsScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.settings, builder: (_, _) => const SettingsScreen())],
          ),
        ],
      ),
    ],
  );

  // Home's tips change every time Home comes back into view — from another
  // tab, or back from a pushed screen (verdict, assistant, scanner…).
  var lastPath = '';
  void onNavigate() {
    final path = router.routerDelegate.currentConfiguration.uri.path;
    if (path == AppRoutes.home && lastPath != AppRoutes.home && lastPath.isNotEmpty) {
      ref.read(homeInsightsProvider.notifier).shuffle();
    }
    lastPath = path;
  }

  router.routerDelegate.addListener(onNavigate);
  ref.onDispose(() {
    router.routerDelegate.removeListener(onNavigate);
    router.dispose();
  });
  return router;
});
