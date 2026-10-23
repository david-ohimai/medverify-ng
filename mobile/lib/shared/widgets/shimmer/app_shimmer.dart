import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/extensions/context_x.dart';
import '../../../core/theme/app_dimens.dart';

/// Wraps a skeleton in the shimmer sweep, using the theme's shimmer colours
/// so it works in light and dark mode. Every loading state in the app uses
/// this — never a bare spinner.
class AppShimmer extends StatelessWidget {
  const AppShimmer({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      label: 'Loading',
      // The sweep repaints every frame; isolate it from the rest of the screen.
      child: RepaintBoundary(
        child: Shimmer.fromColors(
          baseColor: palette.shimmerBase,
          highlightColor: palette.shimmerHighlight,
          period: const Duration(milliseconds: 1200),
          child: child,
        ),
      ),
    );
  }
}

/// A rounded placeholder block. Put several inside one [AppShimmer].
class ShimmerBox extends StatelessWidget {
  const ShimmerBox({this.width, this.height = 16, this.radius = AppRadius.sm, super.key});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      // Shimmer paints over opaque pixels, so the colour itself doesn't show.
      color: Colors.white,
      borderRadius: BorderRadius.circular(radius),
    ),
  );
}

/// A line of placeholder text, [widthFactor] of the available width.
class ShimmerLine extends StatelessWidget {
  const ShimmerLine({this.widthFactor = 1, this.height = 14, super.key});

  final double widthFactor;
  final double height;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    alignment: Alignment.centerLeft,
    widthFactor: widthFactor,
    child: ShimmerBox(height: height, radius: height / 2),
  );
}

class ShimmerCircle extends StatelessWidget {
  const ShimmerCircle({this.size = 40, super.key});

  final double size;

  @override
  Widget build(BuildContext context) => ShimmerBox(width: size, height: size, radius: size / 2);
}
