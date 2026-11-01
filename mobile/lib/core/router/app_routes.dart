abstract final class AppRoutes {
  static const String splash = '/splash';
  static const String onboarding = '/onboarding';
  static const String home = '/home';
  static const String history = '/history';
  static const String scan = '/scan';
  static const String alerts = '/alerts';
  static const String settings = '/settings';

  // Full-screen pages over the tabs.
  static const String scanProgressPattern = '/progress/:id';
  static const String scanResultPattern = '/result/:id';
  static const String manualCheck = '/check';
  static const String camera = '/camera';
  static const String assistant = '/assistant';
  static const String regulator = '/regulator';
  static const String reviewQueue = '/regulator/reviews';
  static const String reviewPattern = '/regulator/reviews/:id';
  static String review(String id) => '/regulator/reviews/$id';

  static String scanProgress(String scanId) => '/progress/$scanId';
  static String scanResult(String scanId) => '/result/$scanId';

  /// Opens the assistant with a question already typed in.
  static String assistantAsking(String question) => Uri(path: assistant, queryParameters: {'q': question}).toString();
}
