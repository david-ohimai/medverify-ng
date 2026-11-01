/// API paths, relative to Env.apiBaseUrl (which already ends in /api/v1).
abstract final class ApiEndpoints {
  static const String registerDevice = '/devices/register';
  static const String refreshTokens = '/devices/refresh';
  static const String me = '/devices/me';
  static const String elevate = '/devices/me/elevate';
  static const String demote = '/devices/me/demote';

  static const String scans = '/scans';
  static String scan(String id) => '/scans/$id';
  static String scanEvents(String id) => '/scans/$id/events';
  static String scanSpeech(String id) => '/scans/$id/speech';
  static const String verifyManual = '/verify/manual';

  static String product(String nafdacNo) => '/products/${Uri.encodeComponent(nafdacNo)}';
  static String referenceImage(String nafdacNo, String imageId) =>
      '/products/${Uri.encodeComponent(nafdacNo)}/reference-images/$imageId';

  static const String alertsNearby = '/alerts/nearby';

  static const String assistantMessages = '/assistant/messages';
}
