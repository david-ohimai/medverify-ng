import 'package:flutter/material.dart';

/// The scanner's viewfinder: everything outside the box is dimmed, the box
/// has bright corner brackets, and a line sweeps up and down inside it,
/// the "scan box" people know from QR scanners.
class ScanFrame extends StatelessWidget {
  const ScanFrame({required this.color, this.active = true, super.key});

  final Color color;

  /// Sweep while waiting; freeze while the photo is being sent.
  final bool active;

  /// The box in the screen: wide like a pack's side, centred a little high.
  static Rect boxFor(Size size) {
    final width = size.width * 0.86;
    final height = width * 0.68;
    return Rect.fromCenter(center: Offset(size.width / 2, size.height * 0.42), width: width, height: height);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final box = boxFor(constraints.biggest);
      return Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _FramePainter(box: box, color: color),
            ),
          ),
          if (active)
            Positioned.fromRect(
              rect: box.deflate(14),
              child: _SweepLine(color: color),
            ),
        ],
      );
    },
  );
}

class _FramePainter extends CustomPainter {
  const _FramePainter({required this.box, required this.color});

  final Rect box;
  final Color color;

  static const _radius = 22.0;
  static const _bracket = 34.0;

  @override
  void paint(Canvas canvas, Size size) {
    final rounded = RRect.fromRectAndRadius(box, const Radius.circular(_radius));
    canvas.drawPath(
      Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), Path()..addRRect(rounded)),
      Paint()..color = Colors.black.withValues(alpha: 0.55),
    );

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final (l, t, r, b) = (box.left, box.top, box.right, box.bottom);
    const k = _radius;
    for (final corner in [
      Path()
        ..moveTo(l, t + _bracket)
        ..lineTo(l, t + k)
        ..arcToPoint(Offset(l + k, t), radius: const Radius.circular(k))
        ..lineTo(l + _bracket, t),
      Path()
        ..moveTo(r - _bracket, t)
        ..lineTo(r - k, t)
        ..arcToPoint(Offset(r, t + k), radius: const Radius.circular(k))
        ..lineTo(r, t + _bracket),
      Path()
        ..moveTo(r, b - _bracket)
        ..lineTo(r, b - k)
        ..arcToPoint(Offset(r - k, b), radius: const Radius.circular(k))
        ..lineTo(r - _bracket, b),
      Path()
        ..moveTo(l + _bracket, b)
        ..lineTo(l + k, b)
        ..arcToPoint(Offset(l, b - k), radius: const Radius.circular(k))
        ..lineTo(l, b - _bracket),
    ]) {
      canvas.drawPath(corner, stroke);
    }
  }

  @override
  bool shouldRepaint(_FramePainter old) => old.box != box || old.color != color;
}

/// The sweeping line. Stateful only to own its AnimationController (never
/// setState); isolated in a RepaintBoundary so only the line repaints.
class _SweepLine extends StatefulWidget {
  const _SweepLine({required this.color});

  final Color color;

  @override
  State<_SweepLine> createState() => _SweepLineState();
}

class _SweepLineState extends State<_SweepLine> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: AnimatedBuilder(
      animation: CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      builder: (_, _) => Align(
        alignment: Alignment(0, _controller.value * 2 - 1),
        child: Container(
          height: 3,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            gradient: LinearGradient(
              colors: [widget.color.withValues(alpha: 0), widget.color, widget.color.withValues(alpha: 0)],
            ),
            boxShadow: [BoxShadow(color: widget.color.withValues(alpha: 0.6), blurRadius: 12)],
          ),
        ),
      ),
    ),
  );
}
