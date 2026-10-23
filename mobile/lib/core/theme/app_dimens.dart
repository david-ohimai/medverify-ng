/// Spacing, radii and sizes. Use these instead of literal numbers so every
/// screen keeps the same rhythm.
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;

  /// Horizontal page gutter on phones.
  static const double gutter = 20;

  /// Space reserved under scrolling content for the floating glass tab bar.
  static const double tabBarClearance = 112;
}

abstract final class AppRadius {
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double pill = 999;
}
