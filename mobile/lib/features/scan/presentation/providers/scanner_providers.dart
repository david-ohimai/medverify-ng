import 'package:camera/camera.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/logging/app_log.dart';

/// The live scanner's camera. Lists cameras, so tests can replace it.
final availableCamerasProvider = Provider<Future<List<CameraDescription>> Function()>((ref) => availableCameras);

class ScannerState extends Equatable {
  const ScannerState({required this.controller, this.torchOn = false, this.capturing = false});

  final CameraController controller;
  final bool torchOn;
  final bool capturing;

  ScannerState copyWith({bool? torchOn, bool? capturing}) =>
      ScannerState(controller: controller, torchOn: torchOn ?? this.torchOn, capturing: capturing ?? this.capturing);

  @override
  List<Object?> get props => [controller, torchOn, capturing];
}

final scannerControllerProvider = AsyncNotifierProvider.autoDispose<ScannerController, ScannerState>(
  ScannerController.new,
);

/// Owns the camera for the scanner screen: opened when the screen opens,
/// released when it closes or the app goes to the background (and reopened
/// when it comes back), so the camera is never held longer than needed.
class ScannerController extends AsyncNotifier<ScannerState> {
  CameraController? _camera;
  bool _released = false;

  @override
  Future<ScannerState> build() async {
    _released = false;
    final lifecycle = AppLifecycleListener(onHide: _release, onShow: _reopen);
    ref.onDispose(() {
      lifecycle.dispose();
      _release();
    });

    final cameras = await ref.read(availableCamerasProvider)();
    if (cameras.isEmpty) throw const UnexpectedFailure('No camera found on this phone.');
    final back = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back, orElse: () => cameras.first);

    // ~1080p: sharp enough to read small print, small enough to upload fast.
    final camera = CameraController(
      back,
      ResolutionPreset.veryHigh,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );
    _camera = camera;
    try {
      await camera.initialize();
      await camera.setFlashMode(FlashMode.off);
    } on CameraException catch (error) {
      AppLog.info('Camera failed: ${error.code} ${error.description}');
      throw UnexpectedFailure(
        error.code.contains('AccessDenied') || error.code.contains('Permission')
            ? 'MedVerify needs the camera to scan. Allow it in the app settings, or choose a photo instead.'
            : 'The camera could not start. Close other camera apps and try again.',
      );
    }
    return ScannerState(controller: camera);
  }

  void _release() {
    if (_released) return;
    _released = true;
    _camera?.dispose();
    _camera = null;
  }

  void _reopen() {
    if (_released && ref.mounted) ref.invalidateSelf();
  }

  Future<void> toggleTorch() async {
    final current = state.value;
    if (current == null) return;
    final on = !current.torchOn;
    try {
      await current.controller.setFlashMode(on ? FlashMode.torch : FlashMode.off);
      state = AsyncData(current.copyWith(torchOn: on));
    } on CameraException {
      // No torch on this camera: nothing to toggle.
    }
  }

  /// Takes the photo; returns its path on the phone, or null.
  Future<String?> takePicture() async {
    final current = state.value;
    if (current == null || current.capturing || current.controller.value.isTakingPicture) return null;
    state = AsyncData(current.copyWith(capturing: true));
    try {
      final file = await current.controller.takePicture();
      if (current.torchOn) await current.controller.setFlashMode(FlashMode.off);
      return file.path;
    } on CameraException catch (error) {
      AppLog.info('Capture failed: ${error.code}');
      return null;
    } finally {
      if (ref.mounted && state.value != null) {
        state = AsyncData(state.value!.copyWith(capturing: false, torchOn: false));
      }
    }
  }
}
