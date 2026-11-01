import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/network/sse.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/features/scan/data/scan_models.dart';
import 'package:medverify/features/scan/data/scan_repository.dart';
import 'package:medverify/features/scan/domain/entities/scan_progress.dart';
import 'package:medverify/features/scan/domain/entities/scan_result.dart';
import 'package:medverify/features/scan/presentation/providers/scan_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockRepository extends Mock implements ScanRepository {}

Map<String, dynamic> _resultJson({String verdict = 'suspicious', String status = 'done'}) => {
  'scanId': 'scan-1',
  'kind': 'photo',
  'status': status,
  'verdict': verdict,
  'riskScore': 40,
  'confidence': 'medium',
  'headline': 'Suspicious',
  'advice': 'Ask a pharmacist before taking it.',
  'signals': [
    {'code': 'TEXT_ANOMALIES', 'label': 'Spelling problems on the label', 'weight': 20, 'severity': 'warning'},
  ],
  'failure': null,
  'review': {'status': 'open', 'decision': null, 'note': null, 'message': 'A pharmacist will double-check this scan.'},
  'input': {'nafdacNo': 'X9-0001', 'productName': 'DEMOQUINE', 'batchNo': 'DQ2401', 'expiry': '2027-08'},
  'product': {
    'nafdacNo': 'X9-0001',
    'brandName': 'Demoquine',
    'genericName': 'Artemether/Lumefantrine',
    'strength': null,
    'manufacturer': null,
    'source': 'demo',
  },
  'areaName': 'Idumota market, Lagos',
  'checkedAt': '2026-10-30T08:00:00.000Z',
  'disclaimer': 'Never 100% safe.',
};

void main() {
  group('ScanModels', () {
    test('parses a verdict with signals, review, product and demo flag', () {
      final result = ScanModels.result(_resultJson());
      expect(result.verdict, Verdict.suspicious);
      expect(result.confidence, Confidence.medium);
      expect(result.signals.single.severity, SignalSeverity.warning);
      expect(result.review?.message, contains('pharmacist'));
      expect(result.product?.isDemo, isTrue);
      expect(result.displayName, 'Demoquine');
    });

    test('reference images: front first', () {
      final ids = ScanModels.referenceImageIds({
        'referenceImages': [
          {'id': 'back-1', 'side': 'back'},
          {'id': 'front-1', 'side': 'front'},
        ],
      });
      expect(ids, ['front-1', 'back-1']);
    });
  });

  group('ScanProgressController', () {
    late _MockRepository repository;
    late StreamController<SseEvent> events;
    late ProviderContainer container;

    setUp(() {
      repository = _MockRepository();
      events = StreamController<SseEvent>();
      when(() => repository.progress('scan-1')).thenAnswer((_) => events.stream);
      when(
        () => repository.history(
          page: any(named: 'page'),
          limit: any(named: 'limit'),
        ),
      ).thenAnswer((_) async => const Success(<ScanResult>[]));
      container = ProviderContainer(overrides: [scanRepositoryProvider.overrideWithValue(repository)]);
      addTearDown(container.dispose);
    });

    test('steps tick as events arrive, then the verdict finishes the scan', () async {
      final sub = container.listen(scanProgressProvider('scan-1'), (_, _) {});
      addTearDown(sub.close);

      events.add(
        const SseEvent(event: 'step', data: {'step': 'read_label', 'status': 'active', 'label': 'Reading the label'}),
      );
      await pumpEventQueue();
      expect(sub.read().steps[1].state, StepStatus.active);

      events.add(
        const SseEvent(
          event: 'step',
          data: {'step': 'compare_pack', 'status': 'skipped', 'label': 'No genuine reference photo yet'},
        ),
      );
      events.add(SseEvent(event: 'verdict', data: {'result': _resultJson()}));
      await pumpEventQueue();

      final progress = sub.read();
      expect(progress.steps.firstWhere((s) => s.step == PipelineStep.comparePack).state, StepStatus.skipped);
      expect(progress.steps.any((s) => s.state == StepStatus.active), isFalse);
      expect(progress.result?.verdict, Verdict.suspicious);
    });

    test('an error event ends the scan with its message', () async {
      final sub = container.listen(scanProgressProvider('scan-1'), (_, _) {});
      addTearDown(sub.close);
      events.add(const SseEvent(event: 'error', data: {'code': 'NOT_A_MEDICINE_PACK', 'message': 'Not a pack.'}));
      await pumpEventQueue();
      expect(sub.read().errorMessage, 'Not a pack.');
    });
  });

  group('HistoryController', () {
    late _MockRepository repository;
    late ProviderContainer container;
    late List<AsyncValue<HistoryPage>> states;

    void historyReturns(Result<List<ScanResult>> result) => when(
      () => repository.history(
        page: any(named: 'page'),
        limit: any(named: 'limit'),
      ),
    ).thenAnswer((_) async => result);

    setUp(() async {
      repository = _MockRepository();
      historyReturns(Success([ScanModels.result(_resultJson(status: 'processing'))]));
      container = ProviderContainer(overrides: [scanRepositoryProvider.overrideWithValue(repository)]);
      addTearDown(container.dispose);
      states = [];
      container.listen(historyProvider, (_, next) => states.add(next), fireImmediately: true);
      await container.read(historyProvider.future);
    });

    test('a background refresh updates the list without a loading state', () async {
      historyReturns(Success([ScanModels.result(_resultJson())]));
      states.clear();

      await container.read(historyProvider.notifier).refresh();

      expect(states.any((s) => s.isLoading), isFalse);
      expect(container.read(historyProvider).value!.items.single.status, ScanStatus.done);
    });

    test('a failed refresh keeps what is on screen', () async {
      historyReturns(const Err(NetworkFailure('Offline')));

      await container.read(historyProvider.notifier).refresh();

      expect(container.read(historyProvider).value!.items.single.status, ScanStatus.processing);
    });
  });

  group('ManualCheckController', () {
    test('expiry: MM/YYYY becomes YYYY-MM; blank is null', () {
      expect(ManualCheckController.normaliseExpiry('8/2027'), '2027-08');
      expect(ManualCheckController.normaliseExpiry('08-2027'), '2027-08');
      expect(ManualCheckController.normaliseExpiry('2027-08'), '2027-08');
      expect(ManualCheckController.normaliseExpiry('  '), isNull);
    });

    test('server field errors are shown on the right field', () async {
      final repository = _MockRepository();
      registerFallbackValue(const ManualCheckInput(nafdacNo: 'x'));
      when(() => repository.checkManually(any(), location: any(named: 'location'))).thenAnswer(
        (_) async => const Err(
          ValidationFailure(
            'Validation failed',
            fieldErrors: [FieldError(field: 'body.nafdacNo', message: 'Not a valid NAFDAC number')],
          ),
        ),
      );
      final container = ProviderContainer(overrides: [scanRepositoryProvider.overrideWithValue(repository)]);
      addTearDown(container.dispose);
      final sub = container.listen(manualCheckControllerProvider, (_, _) {});
      addTearDown(sub.close);

      container.read(manualCheckControllerProvider.notifier).setNafdacNo('hello');
      final id = await container.read(manualCheckControllerProvider.notifier).submit();

      expect(id, isNull);
      expect(sub.read().fieldErrors['nafdacNo'], 'Not a valid NAFDAC number');
    });
  });
}
