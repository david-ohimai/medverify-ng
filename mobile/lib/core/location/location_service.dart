import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// An approximate position. The server rounds it to ~1 km before storing it.
class ApproxLocation {
  const ApproxLocation(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

/// Location is optional everywhere: every method returns null rather than
/// failing (service off, permission refused, no fix in time), and callers
/// carry on without it.
class LocationService {
  const LocationService();

  Future<ApproxLocation?> current({bool ask = true}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && ask) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return null;

      final last = await Geolocator.getLastKnownPosition();
      if (last != null && DateTime.now().difference(last.timestamp) < const Duration(minutes: 30)) {
        return ApproxLocation(last.latitude, last.longitude);
      }
      final position = await Geolocator.getCurrentPosition(
        // Coarse is all we need — and all the app asks permission for.
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 8)),
      );
      return ApproxLocation(position.latitude, position.longitude);
    } catch (_) {
      return null;
    }
  }
}

final locationServiceProvider = Provider<LocationService>((ref) => const LocationService());
