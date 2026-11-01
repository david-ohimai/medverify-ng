import 'package:flutter/foundation.dart';

/// Compile-time configuration, passed with --dart-define-from-file.
///
///   fvm flutter run --dart-define-from-file=env/dev.json
///
/// Nothing secret lives here, the app ships no API keys.
abstract final class Env {
  /// REST base URL including the /api/v1 prefix.
  static const String apiBaseUrl = String.fromEnvironment('API_URL');

  /// Checked once at startup so a misconfigured build fails immediately
  /// instead of on the first request.
  static void validate() {
    if (apiBaseUrl.isEmpty) {
      throw StateError('API_URL is not set. Run with --dart-define-from-file=env/dev.json');
    }
    final uri = Uri.tryParse(apiBaseUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw StateError('API_URL is not a valid URL: $apiBaseUrl');
    }
    // Release builds talk to the server over HTTPS only.
    if (kReleaseMode && uri.scheme != 'https') {
      throw StateError('Release builds require an https API_URL.');
    }
  }
}
