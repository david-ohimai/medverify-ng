import 'package:flutter/material.dart';

/// Brand colours that Material's ColorScheme has no slot for: the orange
/// action colour, verdict colours, the AI gradient, shimmer and backdrop.
/// Read with `context.palette` (see context_x.dart).
///
/// Mix: Idey's navy + orange CTA, Laba's green, Ridify's sky blue, and the
/// purple→blue "AI Insight" gradient from the reference screenshots.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.action,
    required this.onAction,
    required this.actionContainer,
    required this.info,
    required this.genuine,
    required this.genuineContainer,
    required this.suspicious,
    required this.suspiciousContainer,
    required this.danger,
    required this.dangerContainer,
    required this.aiGradient,
    required this.aiContainer,
    required this.shimmerBase,
    required this.shimmerHighlight,
    required this.backdropBase,
    required this.backdropTints,
    required this.cardBorder,
  });

  /// Primary call to action (scan button, main buttons). Never a verdict colour.
  final Color action;
  final Color onAction;
  final Color actionContainer;
  final Color info;

  final Color genuine;
  final Color genuineContainer;
  final Color suspicious;
  final Color suspiciousContainer;
  final Color danger;
  final Color dangerContainer;

  /// Anything produced by AI: insight pill, tool chips, chat bubbles.
  final List<Color> aiGradient;
  final Color aiContainer;

  final Color shimmerBase;
  final Color shimmerHighlight;

  /// The page background and the soft colour blobs the liquid glass refracts.
  final Color backdropBase;
  final List<Color> backdropTints;

  final Color cardBorder;

  static const light = AppPalette(
    action: Color(0xFFFF8C00),
    onAction: Color(0xFFFFFFFF),
    actionContainer: Color(0xFFFFF1E0),
    info: Color(0xFF38B6FF),
    genuine: Color(0xFF1E8A4A),
    genuineContainer: Color(0xFFDDF3E5),
    suspicious: Color(0xFFD97706),
    suspiciousContainer: Color(0xFFFEF0D7),
    danger: Color(0xFFE74C3C),
    dangerContainer: Color(0xFFFDE4E1),
    aiGradient: [Color(0xFF6155F5), Color(0xFF38B6FF)],
    aiContainer: Color(0xFFEDEBFF),
    shimmerBase: Color(0xFFE9ECF1),
    shimmerHighlight: Color(0xFFF7F8FA),
    backdropBase: Color(0xFFF7F8FA),
    backdropTints: [Color(0x338ECAE6), Color(0x26FF8C00), Color(0x266155F5)],
    cardBorder: Color(0xFFECEEF2),
  );

  static const dark = AppPalette(
    action: Color(0xFFFFA53D),
    onAction: Color(0xFF2A1600),
    actionContainer: Color(0xFF4A2A05),
    info: Color(0xFF7CCFFF),
    genuine: Color(0xFF5CB87E),
    genuineContainer: Color(0xFF173A26),
    suspicious: Color(0xFFFBBF24),
    suspiciousContainer: Color(0xFF3D2E0A),
    danger: Color(0xFFFF8A80),
    dangerContainer: Color(0xFF4A1C18),
    aiGradient: [Color(0xFF8B82FF), Color(0xFF5CC4FF)],
    aiContainer: Color(0xFF26234D),
    shimmerBase: Color(0xFF1E293B),
    shimmerHighlight: Color(0xFF2B3850),
    backdropBase: Color(0xFF0B1220),
    backdropTints: [Color(0x4023A6D9), Color(0x33FF8C00), Color(0x406155F5)],
    cardBorder: Color(0xFF263247),
  );

  LinearGradient get aiLinearGradient =>
      LinearGradient(colors: aiGradient, begin: Alignment.centerLeft, end: Alignment.centerRight);

  @override
  AppPalette copyWith() => this;

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    List<Color> mixAll(List<Color> a, List<Color> b) => [for (var i = 0; i < a.length; i++) mix(a[i], b[i])];
    return AppPalette(
      action: mix(action, other.action),
      onAction: mix(onAction, other.onAction),
      actionContainer: mix(actionContainer, other.actionContainer),
      info: mix(info, other.info),
      genuine: mix(genuine, other.genuine),
      genuineContainer: mix(genuineContainer, other.genuineContainer),
      suspicious: mix(suspicious, other.suspicious),
      suspiciousContainer: mix(suspiciousContainer, other.suspiciousContainer),
      danger: mix(danger, other.danger),
      dangerContainer: mix(dangerContainer, other.dangerContainer),
      aiGradient: mixAll(aiGradient, other.aiGradient),
      aiContainer: mix(aiContainer, other.aiContainer),
      shimmerBase: mix(shimmerBase, other.shimmerBase),
      shimmerHighlight: mix(shimmerHighlight, other.shimmerHighlight),
      backdropBase: mix(backdropBase, other.backdropBase),
      backdropTints: mixAll(backdropTints, other.backdropTints),
      cardBorder: mix(cardBorder, other.cardBorder),
    );
  }
}
