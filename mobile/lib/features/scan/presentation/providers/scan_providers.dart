import 'dart:async';
import 'dart:typed_data';

import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/location/location_service.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/network/sse.dart';
import '../../../../core/result/result.dart';
import '../../data/scan_models.dart';
import '../../data/scan_repository.dart';
import '../../domain/entities/scan_progress.dart';
import '../../domain/entities/scan_result.dart';

final scanRepositoryProvider = Provider<ScanRepository>((ref) => ScanRepository(ref.watch(apiClientProvider)));

/// Replaced in tests; the real picker opens the camera or gallery.
final imagePickerProvider = Provider<ImagePicker>((ref) => ImagePicker());

// ─── Capture → upload ────────────────────────────────────────────────────────

sealed class CaptureState extends Equatable {
  const CaptureState();
  @override
  List<Object?> get props => [];
}

final class CaptureIdle extends CaptureState {
  const CaptureIdle();
}

final class CaptureBusy extends CaptureState {
  const CaptureBusy(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

final class CaptureFailed extends CaptureState {
  const CaptureFailed(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}

final captureControllerProvider = NotifierProvider.autoDispose<CaptureController, CaptureState>(CaptureController.new);

/// Takes or picks the photo, adds the (optional, approximate) location and
/// uploads it. Returns the new scan id for the screen to navigate to.
class CaptureController extends Notifier<CaptureState> {
  @override
  CaptureState build() => const CaptureIdle();

  Future<String?> capture(ImageSource source) async {
    if (state is CaptureBusy) return null;
    final XFile? photo;
    try {
      // ~2000 px and 85 % JPEG: plenty for the label, a fraction of the upload.
      photo = await ref
          .read(imagePickerProvider)
          .pickImage(source: source, maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
    } catch (_) {
      state = const CaptureFailed('Could not open the camera. Check the camera permission in Settings.');
      return null;
    }
    if (photo == null) return null; // cancelled
    if (!ref.mounted) return null;

    state = const CaptureBusy('Sending your photo…');
    // Location never delays a scan by more than a few seconds, and is optional.
    final location = await ref
        .read(locationServiceProvider)
        .current()
        .timeout(const Duration(seconds: 5), onTimeout: () => null);
    final result = await ref.read(scanRepositoryProvider).submitPhoto(path: photo.path, location: location);
    if (!ref.mounted) return null;

    switch (result) {
      case Success(:final value):
        ref.read(capturedPhotosProvider.notifier).remember(value, photo.path);
        state = const CaptureIdle();
        return value;
      case Err(:final failure):
        state = CaptureFailed(failure.message);
        return null;
    }
  }

  void dismissError() => state = const CaptureIdle();
}

/// scanId → the photo on this phone, for "yours vs genuine". The server
/// doesn't keep photos, so only scans taken in this session have one.
final capturedPhotosProvider = NotifierProvider<CapturedPhotos, Map<String, String>>(CapturedPhotos.new);

class CapturedPhotos extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() => const {};

  void remember(String scanId, String path) => state = {...state, scanId: path};
}

// ─── Live progress ───────────────────────────────────────────────────────────

final scanProgressProvider = NotifierProvider.autoDispose.family<ScanProgressController, ScanProgress, String>(
  ScanProgressController.new,
);

/// Follows a scan over SSE ("watch the AI think"). If the stream drops before
/// the verdict, it falls back to polling GET /scans/:id every 1.5 s.
class ScanProgressController extends Notifier<ScanProgress> {
  ScanProgressController(this.scanId);

  final String scanId;
  StreamSubscription<SseEvent>? _subscription;
  Timer? _poll;

  static const _pollEvery = Duration(milliseconds: 1500);
  static const _pollFor = Duration(minutes: 2);

  @override
  ScanProgress build() {
    ref.onDispose(() {
      _subscription?.cancel();
      _poll?.cancel();
    });
    _subscription = ref
        .read(scanRepositoryProvider)
        .progress(scanId)
        .listen(_onEvent, onError: (_) => _startPolling(), onDone: () => state.finished ? null : _startPolling());
    return ScanProgress.initial();
  }

  void _onEvent(SseEvent event) {
    final json = event.json;
    switch (event.event) {
      case 'step':
        final step = PipelineStep.fromCode(json['step']);
        if (step == null) return;
        final current = state.steps.firstWhere((s) => s.step == step);
        state = state.withStep(
          current.copyWith(
            state: switch (json['status']) {
              'active' => StepStatus.active,
              'skipped' => StepStatus.skipped,
              _ => StepStatus.done,
            },
            label: json['label'] as String?,
            detail: json['detail'] as String?,
          ),
        );
      case 'verdict':
        _finish(ScanModels.result(json['result']));
      case 'error':
        state = state.finish(errorMessage: json['message'] as String? ?? 'This photo could not be checked.');
        _subscription?.cancel();
    }
  }

  void _finish(ScanResult result) {
    state = state.finish(result: result);
    _subscription?.cancel();
    _poll?.cancel();
    ref.invalidate(historyProvider);
  }

  void _startPolling() {
    if (state.finished || _poll != null) return;
    final deadline = DateTime.now().add(_pollFor);
    _poll = Timer.periodic(_pollEvery, (timer) async {
      if (DateTime.now().isAfter(deadline)) {
        timer.cancel();
        if (ref.mounted && !state.finished) {
          state = state.finish(errorMessage: 'This is taking too long. Check History later.');
        }
        return;
      }
      final result = await ref.read(scanRepositoryProvider).get(scanId);
      if (!ref.mounted) return;
      if (result case Success(:final value) when value.status.finished) {
        timer.cancel();
        value.status == ScanStatus.done ? _finish(value) : state = state.finish(errorMessage: value.advice);
      }
    });
  }
}

// ─── Results ─────────────────────────────────────────────────────────────────

/// One scan by id (history, deep links). Throws the [Failure] on error.
final scanResultProvider = FutureProvider.autoDispose.family<ScanResult, String>((ref, scanId) async {
  return switch (await ref.watch(scanRepositoryProvider).get(scanId)) {
    Success(:final value) => value,
    Err(:final failure) => throw failure,
  };
});

/// The first genuine-pack photo for a registered product, or null if it has none.
final referenceImageProvider = FutureProvider.autoDispose.family<Uint8List?, String>((ref, nafdacNo) async {
  final repository = ref.watch(scanRepositoryProvider);
  final ids = await repository.referenceImageIds(nafdacNo);
  final first = ids.valueOrNull?.firstOrNull;
  if (first == null) return null;
  return (await repository.referenceImage(nafdacNo, first)).valueOrNull;
});

// ─── History ─────────────────────────────────────────────────────────────────

class HistoryPage extends Equatable {
  const HistoryPage({required this.items, required this.page, required this.hasMore, this.loadingMore = false});

  final List<ScanResult> items;
  final int page;
  final bool hasMore;
  final bool loadingMore;

  @override
  List<Object?> get props => [items, page, hasMore, loadingMore];
}

final historyProvider = AsyncNotifierProvider<HistoryController, HistoryPage>(HistoryController.new);

class HistoryController extends AsyncNotifier<HistoryPage> {
  static const _pageSize = 20;

  @override
  Future<HistoryPage> build() async {
    final result = await ref.read(scanRepositoryProvider).history(limit: _pageSize);
    return switch (result) {
      Success(:final value) => HistoryPage(items: value, page: 1, hasMore: value.length == _pageSize),
      Err(:final failure) => throw failure,
    };
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.loadingMore) return;
    state = AsyncData(HistoryPage(items: current.items, page: current.page, hasMore: true, loadingMore: true));
    final result = await ref.read(scanRepositoryProvider).history(page: current.page + 1, limit: _pageSize);
    state = AsyncData(switch (result) {
      Success(:final value) => HistoryPage(
        items: [...current.items, ...value],
        page: current.page + 1,
        hasMore: value.length == _pageSize,
      ),
      // Keep what we have; the next scroll tries again.
      Err() => HistoryPage(items: current.items, page: current.page, hasMore: true),
    });
  }
}

/// The three newest scans, for Home. Derived, so it never fetches on its own.
final recentScansProvider = Provider<AsyncValue<List<ScanResult>>>(
  (ref) => ref.watch(historyProvider).whenData((page) => page.items.take(3).toList()),
);

// ─── Typed-in check ──────────────────────────────────────────────────────────

class ManualCheckState extends Equatable {
  const ManualCheckState({
    this.nafdacNo = '',
    this.productName = '',
    this.batchNo = '',
    this.expiry = '',
    this.submitting = false,
    this.error,
    this.fieldErrors = const {},
  });

  final String nafdacNo;
  final String productName;
  final String batchNo;
  final String expiry;
  final bool submitting;
  final String? error;

  /// Server validation messages by field (nafdacNo, expiry, …).
  final Map<String, String> fieldErrors;

  bool get canSubmit => nafdacNo.trim().length >= 4 && !submitting;

  ManualCheckState copyWith({
    String? nafdacNo,
    String? productName,
    String? batchNo,
    String? expiry,
    bool? submitting,
    String? error,
    Map<String, String>? fieldErrors,
  }) => ManualCheckState(
    nafdacNo: nafdacNo ?? this.nafdacNo,
    productName: productName ?? this.productName,
    batchNo: batchNo ?? this.batchNo,
    expiry: expiry ?? this.expiry,
    submitting: submitting ?? this.submitting,
    error: error,
    fieldErrors: fieldErrors ?? this.fieldErrors,
  );

  @override
  List<Object?> get props => [nafdacNo, productName, batchNo, expiry, submitting, error, fieldErrors];
}

final manualCheckControllerProvider = NotifierProvider.autoDispose<ManualCheckController, ManualCheckState>(
  ManualCheckController.new,
);

class ManualCheckController extends Notifier<ManualCheckState> {
  @override
  ManualCheckState build() => const ManualCheckState();

  void setNafdacNo(String value) => state = state.copyWith(nafdacNo: value, fieldErrors: const {});
  void setProductName(String value) => state = state.copyWith(productName: value);
  void setBatchNo(String value) => state = state.copyWith(batchNo: value);

  /// Accepts "08/2027", "2027-08" or "082027" and sends YYYY-MM.
  void setExpiry(String value) => state = state.copyWith(expiry: value, fieldErrors: const {});

  static String? normaliseExpiry(String raw) {
    final text = raw.trim();
    if (text.isEmpty) return null;
    final monthYear = RegExp(r'^(\d{1,2})\s*[/\-.]\s*(\d{4})$').firstMatch(text);
    if (monthYear != null) return '${monthYear[2]}-${monthYear[1]!.padLeft(2, '0')}';
    return text; // "2027-08" already, or let the server explain what's wrong
  }

  Future<String?> submit() async {
    if (!state.canSubmit) return null;
    state = state.copyWith(submitting: true);
    String? orNull(String v) => v.trim().isEmpty ? null : v.trim();
    final location = await ref
        .read(locationServiceProvider)
        .current(ask: false)
        .timeout(const Duration(seconds: 3), onTimeout: () => null);
    final result = await ref
        .read(scanRepositoryProvider)
        .checkManually(
          ManualCheckInput(
            nafdacNo: state.nafdacNo.trim(),
            productName: orNull(state.productName),
            batchNo: orNull(state.batchNo),
            expiry: normaliseExpiry(state.expiry),
          ),
          location: location,
        );
    if (!ref.mounted) return null;
    switch (result) {
      case Success(:final value):
        state = state.copyWith(submitting: false);
        ref.invalidate(historyProvider);
        return value.id;
      case Err(:final failure):
        state = state.copyWith(
          submitting: false,
          error: failure.message,
          fieldErrors: failure is ValidationFailure
              ? {for (final e in failure.fieldErrors) (e.field ?? '').replaceFirst('body.', ''): e.message}
              : const {},
        );
        return null;
    }
  }
}
