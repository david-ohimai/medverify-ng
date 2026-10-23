import 'package:flutter/material.dart';

/// Satoshi type scale. The font has no 600 weight, so headings use Bold (700).
abstract final class AppTypography {
  static const String fontFamily = 'Satoshi';

  static TextTheme textTheme(Color primary, Color secondary) => TextTheme(
    // Risk score inside the verdict ring.
    displayLarge: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, height: 1.1, color: primary),
    // Page titles ("Overview", "Scans").
    headlineLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1.15, letterSpacing: -0.5, color: primary),
    // Greeting, stat numbers.
    headlineMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, height: 1.2, letterSpacing: -0.3, color: primary),
    headlineSmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.2, color: primary),
    // Section headers ("Needs your attention").
    titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.3, color: primary),
    // Card titles.
    titleMedium: TextStyle(fontSize: 17, fontWeight: FontWeight.w500, height: 1.35, color: primary),
    titleSmall: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.35, color: primary),
    bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5, color: primary),
    bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, height: 1.5, color: secondary),
    // Hints, meta lines.
    bodySmall: TextStyle(fontSize: 13, fontWeight: FontWeight.w300, height: 1.45, color: secondary),
    // Buttons, chips, tabs.
    labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, height: 1.2, color: primary),
    labelMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, height: 1.2, color: primary),
    labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, height: 1.2, letterSpacing: 0.2, color: secondary),
  );
}
