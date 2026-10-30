/// Keys for secure storage (credentials) and preferences (settings).
abstract final class StorageKeys {
  // Secure storage — Android Keystore / iOS Keychain.
  static const String installId = 'install_id';
  static const String accessToken = 'access_token';
  static const String refreshToken = 'refresh_token';

  // Preferences — plain settings, nothing sensitive.
  static const String themeMode = 'theme_mode';
  static const String language = 'language';
  static const String onboardingDone = 'onboarding_done';
  static const String seenAlerts = 'seen_alerts';

  static const Set<String> preferenceKeys = {themeMode, language, onboardingDone, seenAlerts};
}
