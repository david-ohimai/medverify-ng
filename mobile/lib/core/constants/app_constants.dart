abstract final class AppConstants {
  static const String appName = 'MedVerify NG';
  static const String tagline = 'Verify a medicine before you take it.';

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
  static const Duration sendTimeout = Duration(seconds: 30);

  /// Content never grows wider than this on tablets.
  static const double maxContentWidth = 560;
}
