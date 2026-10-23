/// API paths, relative to Env.apiBaseUrl (which already ends in /api/v1).
abstract final class ApiEndpoints {
  static const String registerDevice = '/devices/register';
  static const String refreshTokens = '/devices/refresh';
  static const String me = '/devices/me';
  static const String elevate = '/devices/me/elevate';
  static const String demote = '/devices/me/demote';
}
