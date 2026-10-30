import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../logging/app_log.dart';

/// An approximate position. The server rounds it to ~1 km before storing it.
class ApproxLocation {
  const ApproxLocation(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

/// Why there is no location — each has a different fix for the user.
enum LocationProblem {
  /// The phone's Location switch is off.
  serviceOff('Location is turned off on this phone.'),

  /// The user said no (they can be asked again).
  denied('Location permission was not given.'),

  /// "Don't ask again": only the app settings can change it.
  deniedForever('Location is blocked for MedVerify. Allow it in the app settings.'),

  /// On, allowed, but no fix arrived in time (indoors, no network location).
  noFix('Could not find your location. Try again near a window, or pick a city.');

  const LocationProblem(this.message);
  final String message;

  /// Which settings screen fixes it, if any.
  bool get fixableInLocationSettings => this == serviceOff;
  bool get fixableInAppSettings => this == deniedForever;
}

/// A location, or why there isn't one.
sealed class LocationOutcome {
  const LocationOutcome();
}

final class LocationFound extends LocationOutcome {
  const LocationFound(this.location);
  final ApproxLocation location;
}

final class LocationUnavailable extends LocationOutcome {
  const LocationUnavailable(this.problem);
  final LocationProblem problem;
}

/// Location is optional everywhere. [locate] explains a failure so the UI can
/// offer the right fix; [current] is the quiet version for scans.
class LocationService {
  const LocationService();

  Future<ApproxLocation?> current({bool ask = true}) async => switch (await locate(ask: ask)) {
    LocationFound(:final location) => location,
    LocationUnavailable() => null,
  };

  Future<LocationOutcome> locate({bool ask = true}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return _unavailable(LocationProblem.serviceOff);

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && ask) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) return _unavailable(LocationProblem.deniedForever);
      if (permission == LocationPermission.denied) return _unavailable(LocationProblem.denied);

      final last = await Geolocator.getLastKnownPosition();
      if (last != null && DateTime.now().difference(last.timestamp) < const Duration(minutes: 30)) {
        return LocationFound(ApproxLocation(last.latitude, last.longitude));
      }
      final position = await Geolocator.getCurrentPosition(
        // Coarse is all we need — and all the app asks permission for.
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 10)),
      );
      AppLog.info('Location found (coarse)');
      return LocationFound(ApproxLocation(position.latitude, position.longitude));
    } on TimeoutException {
      return _unavailable(LocationProblem.noFix);
    } catch (error) {
      AppLog.info('Location failed: $error');
      return _unavailable(LocationProblem.noFix);
    }
  }

  LocationUnavailable _unavailable(LocationProblem problem) {
    AppLog.info('No location: ${problem.name}');
    return LocationUnavailable(problem);
  }

  Future<void> openLocationSettings() => Geolocator.openLocationSettings();
  Future<void> openAppSettings() => Geolocator.openAppSettings();
}

final locationServiceProvider = Provider<LocationService>((ref) => const LocationService());
