import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/location/location_service.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/result/result.dart';
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

  /// Asks for permission if needed.
  Future<void> useMyLocation() async {
    // Riverpod keeps the previous alerts visible while loading.
    state = const AsyncLoading();
    final location = await ref.read(locationServiceProvider).current();
    state = await AsyncValue.guard(
      () => location == null ? _forCity(state.value?.city ?? City.lagos) : _forLocation(location),
    );
  }

  Future<void> selectCity(City city) async {
    // Riverpod keeps the previous alerts visible while loading.
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _forCity(city));
  }

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

/// The tab bar badge: how many warnings are active where the user is looking.
final alertBadgeCountProvider = Provider<int>((ref) => ref.watch(nearbyAlertsProvider).value?.alerts.length ?? 0);
