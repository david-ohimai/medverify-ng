import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../alerts/presentation/providers/alerts_providers.dart';
import '../../../scan/presentation/providers/scan_providers.dart';

/// How often nearby alerts are re-checked while the app is open. The server
/// re-clusters hotspots every 15 minutes, so this is plenty.
const alertsRefreshEvery = Duration(minutes: 3);

/// Keeps History, Home's recent checks and Alerts current with no pull to
/// refresh: on returning to the app, and every few minutes for alerts. Tab
/// visits are handled by the router (app_router.dart). Every refresh runs in
/// the background and keeps what's on screen until new data arrives.
final liveRefreshProvider = Provider<void>((ref) {
  void refreshAlerts() => ref.read(nearbyAlertsProvider.notifier).refresh();

  final lifecycle = AppLifecycleListener(
    onResume: () {
      ref.read(historyProvider.notifier).refresh();
      refreshAlerts();
    },
  );
  final timer = Timer.periodic(alertsRefreshEvery, (_) => refreshAlerts());
  ref.onDispose(() {
    lifecycle.dispose();
    timer.cancel();
  });
});
