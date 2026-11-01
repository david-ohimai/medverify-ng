import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/location/location_service.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/core/storage/preferences_store.dart';
import 'package:medverify/core/storage/storage_providers.dart';
import 'package:medverify/features/alerts/data/alerts_repository.dart';
import 'package:medverify/features/alerts/presentation/providers/alerts_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockPreferences extends Mock implements PreferencesStore {}

class _MockRepository extends Mock implements AlertsRepository {}

class _MockLocation extends Mock implements LocationService {}

NearbyAlert _alert(String id, {String title = 'Recalled batch in Idumota'}) => NearbyAlert(
  id: id,
  severity: 'high',
  distanceKm: 0.4,
  recallInvolved: true,
  includesSimulatedData: true,
  lastSeen: DateTime(2026, 10, 29),
  title: title,
);

void main() {
  late _MockPreferences prefs;
  late _MockRepository repository;
  late _MockLocation location;
  var alerts = <NearbyAlert>[];

  ProviderContainer container() => ProviderContainer.test(
    overrides: [
      preferencesStoreProvider.overrideWithValue(prefs),
      alertsRepositoryProvider.overrideWithValue(repository),
      locationServiceProvider.overrideWithValue(location),
    ],
  );

  setUp(() {
    prefs = _MockPreferences();
    repository = _MockRepository();
    location = _MockLocation();
    alerts = [_alert('a'), _alert('b')];
    when(() => prefs.seenAlerts).thenReturn(<String>{});
    when(() => prefs.setSeenAlerts(any())).thenAnswer((_) async {});
    when(() => location.current(ask: any(named: 'ask'))).thenAnswer((_) async => null);
    when(
      () => repository.nearby(
        latitude: any(named: 'latitude'),
        longitude: any(named: 'longitude'),
        radiusKm: any(named: 'radiusKm'),
      ),
    ).thenAnswer((_) async => Success(alerts));
  });

  test('the badge counts unseen alerts and clears once they are seen, and stays cleared', () async {
    final c = container();
    await c.read(nearbyAlertsProvider.future);
    expect(c.read(alertBadgeCountProvider), 2);

    c.read(seenAlertsProvider.notifier).markSeen(c.read(nearbyAlertsProvider).value!.alerts);
    expect(c.read(alertBadgeCountProvider), 0);
    verify(() => prefs.setSeenAlerts({'a|Recalled batch in Idumota', 'b|Recalled batch in Idumota'})).called(1);
  });

  test('a new alert, or a hotspot that grew (new title), counts again', () async {
    when(() => prefs.seenAlerts).thenReturn({'a|Recalled batch in Idumota', 'b|Recalled batch in Idumota'});
    alerts = [_alert('a'), _alert('b', title: 'Recalled batch spreading in Idumota'), _alert('c')];
    final c = container();
    await c.read(nearbyAlertsProvider.future);
    expect(c.read(alertBadgeCountProvider), 2);
  });

  test('"Use my location" reports why it could not, and keeps the city alerts', () async {
    when(() => location.locate()).thenAnswer((_) async => const LocationUnavailable(LocationProblem.serviceOff));
    final c = container();
    await c.read(nearbyAlertsProvider.future);

    final problem = await c.read(nearbyAlertsProvider.notifier).useMyLocation();

    expect(problem, LocationProblem.serviceOff);
    expect(problem!.fixableInLocationSettings, isTrue);
    expect(c.read(nearbyAlertsProvider).value?.place, 'Lagos');
  });

  test('"Use my location" switches to the user\'s area when it works', () async {
    when(() => location.locate()).thenAnswer((_) async => const LocationFound(ApproxLocation(6.15, 6.77)));
    final c = container();
    await c.read(nearbyAlertsProvider.future);

    expect(await c.read(nearbyAlertsProvider.notifier).useMyLocation(), isNull);
    expect(c.read(nearbyAlertsProvider).value?.usingLocation, isTrue);
    verify(() => repository.nearby(latitude: 6.15, longitude: 6.77, radiusKm: any(named: 'radiusKm'))).called(1);
  });
}
