import 'dart:typed_data';

import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/logging/app_log.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/result/result.dart';
import '../../../scan/domain/entities/scan_result.dart';
import '../../../session/domain/entities/device.dart';
import '../../../session/presentation/providers/session_providers.dart';
import '../../data/regulator_repository.dart';
import '../../domain/regulator_models.dart';

final regulatorRepositoryProvider = Provider<RegulatorRepository>(
  (ref) => RegulatorRepository(ref.watch(apiClientProvider)),
);

T _unwrap<T>(Result<T> result) => switch (result) {
  Success(:final value) => value,
  Err(:final failure) => throw failure,
};

// ─── Role ────────────────────────────────────────────────────────────────────

final deviceRoleProvider = AsyncNotifierProvider<DeviceRoleController, Device>(DeviceRoleController.new);

/// The device's role, as the server sees it. Regulator mode is unlocked with
/// a PIN; the server answers with new tokens carrying the new role (and has
/// already revoked the old ones), which the session stores.
class DeviceRoleController extends AsyncNotifier<Device> {
  /// Offline or unknown: treated as public. Regulator screens fail closed anyway (the server checks).
  static const _unknown = Device(id: '', role: DeviceRole.public, language: AppLanguage.en);

  @override
  Future<Device> build() async {
    // Registration first, so a brand-new install has a token to ask with.
    await ref.watch(sessionControllerProvider.future).catchError((_) {});
    final result = await ref.read(regulatorRepositoryProvider).me();
    return switch (result) {
      Success(:final value) => value,
      Err() => _unknown,
    };
  }

  /// Returns the reason it failed (wrong PIN, locked out, offline), or null when unlocked.
  Future<String?> unlock(String pin) async {
    final result = await ref.read(regulatorRepositoryProvider).elevate(pin.trim());
    switch (result) {
      case Success(:final value):
        await ref.read(sessionRepositoryProvider).adoptTokens(value.tokens);
        AppLog.info('Regulator mode on');
        _roleChanged(value.device);
        return null;
      case Err(:final failure):
        return failure.message;
    }
  }

  Future<String?> leave() async {
    final result = await ref.read(regulatorRepositoryProvider).demote();
    switch (result) {
      case Success(:final value):
        await ref.read(sessionRepositoryProvider).adoptTokens(value.tokens);
        AppLog.info('Regulator mode off');
        _roleChanged(value.device);
        return null;
      case Err(:final failure):
        return failure.message;
    }
  }

  void _roleChanged(Device device) {
    state = AsyncData(device);
    // Regulator data belongs to the old role; load it fresh.
    ref
      ..invalidate(hotspotStatsProvider)
      ..invalidate(hotspotsProvider)
      ..invalidate(reviewStatsProvider)
      ..invalidate(reviewQueueProvider);
  }
}

/// True only when the server says this device is a regulator.
final isRegulatorProvider = Provider<bool>((ref) => ref.watch(deviceRoleProvider).value?.isRegulator ?? false);

// ─── Dashboard ───────────────────────────────────────────────────────────────

/// 24h / 7d / 30d for the stat cards.
final statsWindowProvider = NotifierProvider.autoDispose<StatsWindow, String>(StatsWindow.new);

class StatsWindow extends Notifier<String> {
  static const windows = ['24h', '7d', '30d'];

  @override
  String build() => '7d';

  void select(String window) => state = window;
}

final hotspotStatsProvider = FutureProvider.autoDispose.family<HotspotStats, String>(
  (ref, window) async => _unwrap(await ref.watch(regulatorRepositoryProvider).hotspotStats(window)),
);

final hotspotsProvider = FutureProvider.autoDispose<List<Hotspot>>(
  (ref) async => _unwrap(await ref.watch(regulatorRepositoryProvider).hotspots()),
);

final reviewStatsProvider = FutureProvider.autoDispose<ReviewStats>(
  (ref) async => _unwrap(await ref.watch(regulatorRepositoryProvider).reviewStats()),
);

// ─── Review queue ────────────────────────────────────────────────────────────

final reviewQueueProvider = FutureProvider.autoDispose.family<List<ReviewItem>, String>(
  (ref, status) async => _unwrap(await ref.watch(regulatorRepositoryProvider).reviews(status)),
);

/// The pack photo of a review (kept by the server only until it's decided).
final reviewImageProvider = FutureProvider.autoDispose.family<Uint8List?, String>(
  (ref, id) async => (await ref.watch(regulatorRepositoryProvider).reviewImage(id)).valueOrNull,
);

final reviewProvider = AsyncNotifierProvider.autoDispose.family<ReviewController, ReviewItem, String>(
  ReviewController.new,
);

/// One review: load, claim (for an hour), decide.
class ReviewController extends AsyncNotifier<ReviewItem> {
  ReviewController(this.id);

  final String id;

  @override
  Future<ReviewItem> build() async => _unwrap(await ref.read(regulatorRepositoryProvider).review(id));

  /// Returns why the claim failed (someone else holds it, already decided), or null.
  Future<String?> claim() async {
    final result = await ref.read(regulatorRepositoryProvider).claim(id);
    if (result case Err(:final failure)) return failure.message;
    state = AsyncData((result as Success<ReviewItem>).value);
    ref.invalidate(reviewQueueProvider);
    return null;
  }

  Future<String?> decide(ReviewDecision decision, {Verdict? verdict, String? note}) async {
    final result = await ref
        .read(regulatorRepositoryProvider)
        .decide(id, decision: decision, verdict: verdict, note: note);
    if (result case Err(:final failure)) {
      return failure is ValidationFailure && failure.fieldErrors.isNotEmpty
          ? failure.fieldErrors.first.message
          : failure.message;
    }
    state = AsyncData((result as Success<ReviewItem>).value);
    ref
      ..invalidate(reviewQueueProvider)
      ..invalidate(reviewStatsProvider)
      ..invalidate(reviewImageProvider(id));
    return null;
  }
}

/// What the reviewer has chosen so far, before submitting.
class DecisionDraft extends Equatable {
  const DecisionDraft({this.decision, this.verdict, this.note = '', this.submitting = false, this.error});

  final ReviewDecision? decision;
  final Verdict? verdict;
  final String note;
  final bool submitting;
  final String? error;

  bool get canSubmit => !submitting && decision != null && (decision != ReviewDecision.disagree || verdict != null);

  @override
  List<Object?> get props => [decision, verdict, note, submitting, error];
}

final decisionDraftProvider = NotifierProvider.autoDispose.family<DecisionDraftController, DecisionDraft, String>(
  DecisionDraftController.new,
);

class DecisionDraftController extends Notifier<DecisionDraft> {
  DecisionDraftController(this.reviewId);

  final String reviewId;

  @override
  DecisionDraft build() => const DecisionDraft();

  void choose(ReviewDecision decision) => state = DecisionDraft(
    decision: decision,
    verdict: decision == ReviewDecision.disagree ? state.verdict : null,
    note: state.note,
  );

  void chooseVerdict(Verdict verdict) =>
      state = DecisionDraft(decision: state.decision, verdict: verdict, note: state.note);

  void setNote(String note) => state = DecisionDraft(decision: state.decision, verdict: state.verdict, note: note);

  /// True when the decision was saved.
  Future<bool> submit() async {
    if (!state.canSubmit) return false;
    final draft = state;
    state = DecisionDraft(decision: draft.decision, verdict: draft.verdict, note: draft.note, submitting: true);
    final error = await ref
        .read(reviewProvider(reviewId).notifier)
        .decide(draft.decision!, verdict: draft.verdict, note: draft.note);
    if (!ref.mounted) return error == null;
    state = DecisionDraft(decision: draft.decision, verdict: draft.verdict, note: draft.note, error: error);
    return error == null;
  }
}
