import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/location/location_service.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/result/result.dart';
import '../../../../core/storage/storage_providers.dart';
import '../../data/alerts_repository.dart';

/// Cities to check when the user doesn't share a location.
enum City {
  lagos('Lagos', 6.4553, 3.3881),
  onitsha('Onitsha', 6.1486, 6.769),
  kano('Kano', 12.005, 8.532),
  abuja('Abuja', 9.071, 7.471),
  aba('Aba', 5.118, 7.35),
  ibadan('Ibadan', 7.389, 3.887),
  portHarcourt('Port Harcourt', 4.799, 7.006);

  const City(this.label, this.latitude, this.longitude);
  final String label;
  final double latitude;
  final double longitude;
}

final alertsRepositoryProvider = Provider<AlertsRepository>((ref) => AlertsRepository(ref.watch(apiClientProvider)));

class NearbyAlerts extends Equatable {
  const NearbyAlerts({required this.alerts, required this.place, required this.usingLocation, this.city});

  final List<NearbyAlert> alerts;

  /// "Near you" or the city name.
  final String place;
  final bool usingLocation;
  final City? city;

  @override
  List<Object?> get props => [alerts, place, usingLocation, city];
}

final nearbyAlertsProvider = AsyncNotifierProvider<NearbyAlertsController, NearbyAlerts>(NearbyAlertsController.new);

/// Warnings within 50 km. Starts with the location only if permission was
/// already given (no prompt at launch); otherwise a city the user picks.
class NearbyAlertsController extends AsyncNotifier<NearbyAlerts> {
  @override
  Future<NearbyAlerts> build() async {
    final location = await ref.read(locationServiceProvider).current(ask: false);
    return location == null ? _forCity(City.lagos) : _forLocation(location);
  }

  /// Asks for permission if needed. Returns why it couldn't, so the screen can
  /// say so and offer the right settings page; null when it worked.
  Future<LocationProblem?> useMyLocation() async {
    final before = state;
    // Shows progress straight away (finding a location can take seconds);
    // Riverpod keeps the previous alerts visible meanwhile.
    state = const AsyncLoading();
    final outcome = await ref.read(locationServiceProvider).locate();
    if (outcome case LocationUnavailable(:final problem)) {
      state = before;
      return problem;
    }
    state = await AsyncValue.guard(() => _forLocation((outcome as LocationFound).location));
    return null;
  }

  Future<void> selectCity(City city) async {
    // Riverpod keeps the previous alerts visible while loading.
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _forCity(city));
  }

  /// Re-checks the same place in the background: the list on screen stays
  /// (no skeleton) and a failed refresh keeps it. Called on visiting Alerts,
  /// on returning to the app, and every few minutes while it is open.
  Future<void> refresh() async {
    final current = state.value;
    if (current == null) {
      // Nothing to keep: a failed first load just tries again.
      if (state.hasError) ref.invalidateSelf();
      return;
    }
    if (_refreshing || state.isLoading) return;
    _refreshing = true;
    try {
      final location = current.usingLocation ? await ref.read(locationServiceProvider).current(ask: false) : null;
      // Location switched off since: keep the last "near you" list.
      if (current.usingLocation && location == null) return;
      final next = await AsyncValue.guard(
        () => location != null ? _forLocation(location) : _forCity(current.city ?? City.lagos),
      );
      // The user may have picked another place meanwhile; theirs wins.
      if (!ref.mounted || state.value != current) return;
      if (next case AsyncData(:final value) when value != current) state = next;
    } finally {
      _refreshing = false;
    }
  }

  bool _refreshing = false;

  Future<NearbyAlerts> _forLocation(ApproxLocation location) async =>
      NearbyAlerts(alerts: await _load(location.latitude, location.longitude), place: 'Near you', usingLocation: true);

  Future<NearbyAlerts> _forCity(City city) async => NearbyAlerts(
    alerts: await _load(city.latitude, city.longitude),
    place: city.label,
    usingLocation: false,
    city: city,
  );

  Future<List<NearbyAlert>> _load(double latitude, double longitude) async {
    return switch (await ref.read(alertsRepositoryProvider).nearby(latitude: latitude, longitude: longitude)) {
      Success(:final value) => value,
      Err(:final failure) => throw failure,
    };
  }
}

/// Identifies what the user has seen: a hotspot that grows gets a new alert
/// title, so it counts as new again.
String alertSeenKey(NearbyAlert alert) => '${alert.id}|${alert.title ?? ''}';

final seenAlertsProvider = NotifierProvider<SeenAlerts, Set<String>>(SeenAlerts.new);

/// Alerts already viewed, kept across launches.
class SeenAlerts extends Notifier<Set<String>> {
  @override
  Set<String> build() => ref.read(preferencesStoreProvider).seenAlerts;

  void markSeen(Iterable<NearbyAlert> alerts) {
    final keys = alerts.map(alertSeenKey).toSet();
    if (keys.difference(state).isEmpty) return;
    // Remember only what's still current, so the list never grows without bound.
    state = {...keys, ...state.where(keys.contains)};
    ref.read(preferencesStoreProvider).setSeenAlerts(state);
  }
}

/// The tab bar badge: warnings the user hasn't looked at yet. Opening the
/// Alerts tab marks them seen (app_shell.dart), so the badge clears.
final alertBadgeCountProvider = Provider<int>((ref) {
  final alerts = ref.watch(nearbyAlertsProvider).value?.alerts ?? const [];
  final seen = ref.watch(seenAlertsProvider);
  return alerts.where((alert) => !seen.contains(alertSeenKey(alert))).length;
});
