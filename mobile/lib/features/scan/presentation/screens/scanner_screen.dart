import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../providers/scan_providers.dart';
import '../providers/scanner_providers.dart';
import '../widgets/scan_frame.dart';

/// The live scanner: camera preview with a scan box, like a QR scanner. Fit
/// the side with the NAFDAC number in the box and tap the shutter; the photo
/// goes straight to the AI. Gallery and typing the number are one tap away.
class ScannerScreen extends ConsumerWidget {
  const ScannerScreen({super.key});

  Future<void> _shoot(BuildContext context, WidgetRef ref) async {
    final path = await ref.read(scannerControllerProvider.notifier).takePicture();
    if (path == null) return;
    final scanId = await ref.read(captureControllerProvider.notifier).submit(path);
    if (scanId != null && context.mounted) context.pushReplacement(AppRoutes.scanProgress(scanId));
  }

  Future<void> _gallery(BuildContext context, WidgetRef ref) async {
    final scanId = await ref.read(captureControllerProvider.notifier).pick(ImageSource.gallery);
    if (scanId != null && context.mounted) context.pushReplacement(AppRoutes.scanProgress(scanId));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Upload errors show as a message over the camera.
    ref.listen(captureControllerProvider, (_, next) {
      if (next case CaptureFailed(:final message)) {
        context.showMessage(message);
        ref.read(captureControllerProvider.notifier).dismissError();
      }
    });
    final camera = ref.watch(scannerControllerProvider);
    final sending = ref.watch(captureControllerProvider.select((s) => s is CaptureBusy));
    final accent = context.palette.action;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          switch (camera) {
            AsyncData(:final value) => _Preview(controller: value.controller),
            AsyncError(:final error) => _CameraError(
              message: error is Failure ? error.message : 'The camera could not start.',
              onRetry: () => ref.invalidate(scannerControllerProvider),
            ),
            _ => const Center(
              child: AppShimmer(child: Icon(Iconsax.camera, size: 56, color: Colors.white)),
            ),
          },
          if (camera.hasValue) ScanFrame(color: accent, active: !sending),
          SafeArea(
            child: Column(
              children: [
                _TopBar(torchOn: camera.value?.torchOn ?? false),
                const SizedBox(height: AppSpacing.md),
                Text(
                  sending ? '' : 'Fit the NAFDAC number, batch and expiry inside the box',
                  textAlign: TextAlign.center,
                  style: context.text.titleSmall?.copyWith(color: Colors.white),
                ),
                const Spacer(),
                if (sending)
                  AppShimmer(
                    child: Text(
                      'Sending your photo…',
                      style: context.text.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                const SizedBox(height: AppSpacing.lg),
                _Controls(
                  enabled: camera.hasValue && !sending,
                  capturing: camera.value?.capturing ?? false,
                  onShoot: () => _shoot(context, ref),
                  onGallery: () => _gallery(context, ref),
                ),
                const SizedBox(height: AppSpacing.xl),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fills the screen with the preview, cropping (not stretching) it.
class _Preview extends StatelessWidget {
  const _Preview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    final size = controller.value.previewSize;
    if (!controller.value.isInitialized || size == null) return const SizedBox.shrink();
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        // previewSize is landscape; the phone is portrait.
        child: SizedBox(width: size.height, height: size.width, child: CameraPreview(controller)),
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({required this.torchOn});

  final bool torchOn;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
    child: Row(
      children: [
        _RoundButton(icon: Iconsax.close_circle, tooltip: 'Close', onTap: () => context.pop()),
        const Spacer(),
        Text(
          'Scan a pack',
          style: context.text.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        const Spacer(),
        _RoundButton(
          icon: torchOn ? Iconsax.flash_1 : Iconsax.flash_slash,
          tooltip: torchOn ? 'Torch off' : 'Torch on',
          onTap: ref.read(scannerControllerProvider.notifier).toggleTorch,
        ),
      ],
    ),
  );
}

class _Controls extends StatelessWidget {
  const _Controls({required this.enabled, required this.capturing, required this.onShoot, required this.onGallery});

  final bool enabled;
  final bool capturing;
  final VoidCallback onShoot;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    final accent = context.palette.action;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _RoundButton(
          icon: Iconsax.gallery,
          tooltip: 'Choose from gallery',
          onTap: enabled ? onGallery : null,
          label: 'Gallery',
        ),
        Semantics(
          button: true,
          label: 'Scan',
          child: GestureDetector(
            onTap: enabled ? onShoot : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: capturing ? 68 : 78,
              height: capturing ? 68 : 78,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: enabled ? accent : accent.withValues(alpha: 0.4),
                border: Border.all(color: Colors.white, width: 5),
              ),
              child: const Icon(Iconsax.scan, color: Colors.white, size: 32),
            ),
          ),
        ),
        _RoundButton(
          icon: Iconsax.keyboard,
          tooltip: 'Type the NAFDAC number',
          onTap: () => context.pushReplacement(AppRoutes.manualCheck),
          label: 'Type it',
        ),
      ],
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.tooltip, required this.onTap, this.label});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final String? label;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton(
        tooltip: tooltip,
        onPressed: onTap,
        style: IconButton.styleFrom(
          backgroundColor: Colors.white.withValues(alpha: 0.18),
          foregroundColor: Colors.white,
          disabledForegroundColor: Colors.white38,
          minimumSize: const Size(52, 52),
        ),
        icon: Icon(icon),
      ),
      if (label != null) Text(label!, style: context.text.labelSmall?.copyWith(color: Colors.white)),
    ],
  );
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Iconsax.camera_slash, color: Colors.white, size: 48),
          const SizedBox(height: AppSpacing.md),
          Text(
            message,
            textAlign: TextAlign.center,
            style: context.text.bodyLarge?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: AppSpacing.md),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    ),
  );
}
