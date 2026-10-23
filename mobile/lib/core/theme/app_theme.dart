import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_dimens.dart';
import 'app_palette.dart';
import 'app_typography.dart';

/// Light and dark ThemeData built from one recipe, so the two never drift.
abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final palette = isDark ? AppPalette.dark : AppPalette.light;

    final scheme = isDark
        ? const ColorScheme(
            brightness: Brightness.dark,
            primary: Color(0xFF8ECAE6),
            onPrimary: Color(0xFF023047),
            primaryContainer: Color(0xFF0B3A52),
            onPrimaryContainer: Color(0xFFE3F1F8),
            secondary: Color(0xFFFFA53D),
            onSecondary: Color(0xFF2A1600),
            secondaryContainer: Color(0xFF4A2A05),
            onSecondaryContainer: Color(0xFFFFE0BD),
            tertiary: Color(0xFF9B93FF),
            onTertiary: Color(0xFF16124D),
            error: Color(0xFFFF8A80),
            onError: Color(0xFF4A0D08),
            surface: Color(0xFF1E293B),
            onSurface: Color(0xFFF9FAFB),
            onSurfaceVariant: Color(0xFF94A3B8),
            surfaceContainerLowest: Color(0xFF0B1220),
            surfaceContainerLow: Color(0xFF151F31),
            surfaceContainer: Color(0xFF1E293B),
            surfaceContainerHigh: Color(0xFF263247),
            surfaceContainerHighest: Color(0xFF334155),
            outline: Color(0xFF3B4659),
            outlineVariant: Color(0xFF263247),
          )
        : const ColorScheme(
            brightness: Brightness.light,
            primary: Color(0xFF023047),
            onPrimary: Color(0xFFFFFFFF),
            primaryContainer: Color(0xFFE3F1F8),
            onPrimaryContainer: Color(0xFF023047),
            secondary: Color(0xFFFF8C00),
            onSecondary: Color(0xFFFFFFFF),
            secondaryContainer: Color(0xFFFFF1E0),
            onSecondaryContainer: Color(0xFF5A3200),
            tertiary: Color(0xFF6155F5),
            onTertiary: Color(0xFFFFFFFF),
            error: Color(0xFFE74C3C),
            onError: Color(0xFFFFFFFF),
            surface: Color(0xFFFFFFFF),
            onSurface: Color(0xFF1F2937),
            onSurfaceVariant: Color(0xFF6B7280),
            surfaceContainerLowest: Color(0xFFF7F8FA),
            surfaceContainerLow: Color(0xFFF3F4F7),
            surfaceContainer: Color(0xFFEFF1F4),
            surfaceContainerHigh: Color(0xFFECEEF2),
            surfaceContainerHighest: Color(0xFFE6E9EE),
            outline: Color(0xFFD5DAE2),
            outlineVariant: Color(0xFFE5E7EB),
          );

    final text = AppTypography.textTheme(scheme.onSurface, scheme.onSurfaceVariant);
    final pillShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill));
    final fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.sm),
      borderSide: BorderSide(color: scheme.outline),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: AppTypography.fontFamily,
      textTheme: text,
      scaffoldBackgroundColor: palette.backdropBase,
      extensions: [palette],
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: text.headlineSmall,
        foregroundColor: scheme.onSurface,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: BorderSide(color: palette.cardBorder),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: palette.action,
          foregroundColor: palette.onAction,
          disabledBackgroundColor: palette.action.withValues(alpha: 0.4),
          disabledForegroundColor: palette.onAction.withValues(alpha: 0.9),
          minimumSize: const Size.fromHeight(56),
          shape: pillShape,
          textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: palette.action,
          minimumSize: const Size.fromHeight(56),
          side: BorderSide(color: scheme.outline),
          shape: pillShape,
          textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: palette.action, textStyle: text.labelLarge),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 18),
        hintStyle: text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant.withValues(alpha: 0.7)),
        border: fieldBorder,
        enabledBorder: fieldBorder,
        focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: palette.action, width: 1.5)),
        errorBorder: fieldBorder.copyWith(borderSide: BorderSide(color: scheme.error)),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        insetPadding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.tabBarClearance),
      ),
    );
  }
}
