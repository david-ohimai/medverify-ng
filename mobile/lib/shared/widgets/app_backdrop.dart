import 'package:flutter/material.dart';

import '../../core/extensions/context_x.dart';

/// The soft mesh-gradient page background. Liquid glass needs colour behind
/// it to refract; over a flat grey page it just looks grey.
///
/// Static and cheap: three radial gradients painted once, isolated in a
/// RepaintBoundary so scrolling never repaints them.
class AppBackdrop extends StatelessWidget {
  const AppBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tints = palette.backdropTints;

    return RepaintBoundary(
      child: DecoratedBox(
        decoration: BoxDecoration(color: palette.backdropBase),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _Blob(color: tints[0], alignment: const Alignment(-1.1, -0.9), radius: 1.1),
            _Blob(color: tints[1], alignment: const Alignment(1.2, -0.1), radius: 0.9),
            _Blob(color: tints[2], alignment: const Alignment(-0.6, 1.1), radius: 1.0),
          ],
        ),
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.alignment, required this.radius});

  final Color color;
  final Alignment alignment;
  final double radius;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: RadialGradient(center: alignment, radius: radius, colors: [color, color.withValues(alpha: 0)]),
    ),
  );
}
