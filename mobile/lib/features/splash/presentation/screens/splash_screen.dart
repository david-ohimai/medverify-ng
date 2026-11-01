import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/theme/app_palette.dart';

/// Launch splash in the Ridify style: it carries on from Android's launch
/// screen (same navy, same logo in the same place, so the app never opens on
/// a blank screen), then "MedVerify" is written letter by letter, a light
/// sweep crosses it, and the tagline fades in. Stateless: every animation is declarative (flutter_animate), and
/// [splashDoneProvider] moves on after ~2.8 s.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  /// The brand navy, also used by the native Android launch screen.
  static const background = Color(0xFF0B1220);

  static const _word = 'MedVerify';
  static const _firstPart = 3; // "Med" in white, "Verify" in orange
  static const _letterStart = Duration(milliseconds: 350);
  static const _letterGap = Duration(milliseconds: 75);

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.dark;
    final lettersDone = _letterStart + _letterGap * _word.length;
    final style = context.text.displaySmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -0.5, height: 1);

    return Scaffold(
      backgroundColor: background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // The same soft colour blobs as the app backdrop, fading in.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.9, -0.8),
                radius: 1.2,
                colors: [palette.backdropTints[0], background.withValues(alpha: 0)],
              ),
            ),
          ).animate().fadeIn(duration: 600.ms),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(1, 0.9),
                radius: 1.1,
                colors: [palette.backdropTints[2], background.withValues(alpha: 0)],
              ),
            ),
          ).animate().fadeIn(duration: 600.ms),
          // The logo sits at the exact centre, already visible: Android's own
          // launch screen shows the same logo there (res/drawable/splash_logo.xml),
          // so the hand-over is seamless. Its glow and a soft pulse come in here.
          Column(
            children: [
              const Spacer(),
              Stack(
                    alignment: Alignment.center,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(color: palette.aiGradient.first.withValues(alpha: 0.5), blurRadius: 32),
                          ],
                        ),
                        child: const SizedBox.square(dimension: SplashLogo.size),
                      ).animate().fadeIn(duration: 500.ms),
                      const SplashLogo(),
                    ],
                  )
                  .animate(delay: 150.ms)
                  .scale(end: const Offset(1.08, 1.08), duration: 220.ms, curve: Curves.easeOut)
                  .then()
                  .scale(end: const Offset(1 / 1.08, 1 / 1.08), duration: 260.ms, curve: Curves.easeOutBack),
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xl),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                for (var i = 0; i < _word.length; i++)
                                  Text(
                                        _word[i],
                                        style: style?.copyWith(color: i < _firstPart ? Colors.white : palette.action),
                                      )
                                      .animate(delay: _letterStart + _letterGap * i)
                                      .fadeIn(duration: 160.ms)
                                      .slideY(begin: 0.6, curve: Curves.easeOutBack, duration: 260.ms)
                                      .scale(begin: const Offset(0.7, 0.7), duration: 220.ms),
                                const SizedBox(width: AppSpacing.xs),
                                Container(
                                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: palette.genuine,
                                        borderRadius: BorderRadius.circular(AppRadius.sm / 2),
                                      ),
                                      child: Text(
                                        'NG',
                                        style: context.text.labelLarge?.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    )
                                    .animate(delay: lettersDone)
                                    .fadeIn(duration: 200.ms)
                                    .scale(begin: const Offset(0.4, 0.4), curve: Curves.easeOutBack, duration: 300.ms),
                              ],
                            )
                            // A light sweep across the finished name.
                            .animate(delay: lettersDone + 250.ms)
                            .shimmer(duration: 700.ms, color: Colors.white.withValues(alpha: 0.6)),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                              AppConstants.tagline,
                              style: context.text.bodyLarge?.copyWith(color: Colors.white.withValues(alpha: 0.75)),
                            )
                            .animate(delay: lettersDone + 150.ms)
                            .fadeIn(duration: 400.ms)
                            .slideY(begin: 0.4, duration: 400.ms, curve: Curves.easeOutCubic),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The MedVerify logo: a shield with a tick in a violet-to-blue circle.
/// Painted from the same shapes as Android's launch logo
/// (android/app/src/main/res/drawable/splash_logo.xml); change both together.
class SplashLogo extends StatelessWidget {
  const SplashLogo({super.key});

  static const size = 96.0;

  @override
  Widget build(BuildContext context) => const CustomPaint(size: Size.square(size), painter: _SplashLogoPainter());
}

class _SplashLogoPainter extends CustomPainter {
  const _SplashLogoPainter();

  // Same colours as splash_logo.xml (AppPalette.dark.aiGradient).
  static const _from = Color(0xFF8B82FF);
  static const _to = Color(0xFF5CC4FF);

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on a 96 × 96 grid, like the vector.
    canvas.scale(size.width / 96);
    const circle = Rect.fromLTWH(0, 0, 96, 96);
    canvas.drawOval(circle, Paint()..shader = const LinearGradient(colors: [_from, _to]).createShader(circle));

    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final shield = Path()
      ..moveTo(48, 25)
      ..lineTo(67, 32)
      ..lineTo(67, 47)
      ..cubicTo(67, 59, 59, 68, 48, 72)
      ..cubicTo(37, 68, 29, 59, 29, 47)
      ..lineTo(29, 32)
      ..close();
    final tick = Path()
      ..moveTo(39.5, 48.5)
      ..lineTo(45.5, 54.5)
      ..lineTo(57, 43);
    canvas
      ..drawPath(shield, stroke)
      ..drawPath(tick, stroke);
  }

  @override
  bool shouldRepaint(_SplashLogoPainter oldDelegate) => false;
}
