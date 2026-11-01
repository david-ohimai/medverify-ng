import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/theme/app_palette.dart';

/// Launch splash in the Ridify style: a solid brand background (matching the
/// native launch screen, so there's no flash), the logo rising in, then
/// "MedVerify" written letter by letter, a light sweep across it, and the
/// tagline. Stateless: every animation is declarative (flutter_animate), and
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
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: palette.aiLinearGradient,
                        boxShadow: [BoxShadow(color: palette.aiGradient.first.withValues(alpha: 0.5), blurRadius: 32)],
                      ),
                      child: const Icon(Iconsax.shield_tick, color: Colors.white, size: 48),
                    )
                    .animate()
                    .fadeIn(duration: 350.ms)
                    .scale(begin: const Offset(0.6, 0.6), curve: Curves.easeOutBack, duration: 450.ms)
                    .slideY(begin: 0.3, curve: Curves.easeOutCubic, duration: 450.ms),
                const SizedBox(height: AppSpacing.xl),
                Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (var i = 0; i < _word.length; i++)
                          Text(_word[i], style: style?.copyWith(color: i < _firstPart ? Colors.white : palette.action))
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
        ],
      ),
    );
  }
}
