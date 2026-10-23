import 'package:flutter/material.dart';

import '../theme/app_palette.dart';

extension ContextX on BuildContext {
  ThemeData get theme => Theme.of(this);
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
  AppPalette get palette => Theme.of(this).extension<AppPalette>() ?? AppPalette.light;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  /// sizeOf (not of) so only size changes rebuild the caller, not every
  /// MediaQuery change such as the keyboard opening.
  double get screenWidth => MediaQuery.sizeOf(this).width;
  bool get isTablet => screenWidth >= 600;

  void showMessage(String message) {
    ScaffoldMessenger.maybeOf(this)
      ?..removeCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}
