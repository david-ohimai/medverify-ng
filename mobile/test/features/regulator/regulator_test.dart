import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/features/regulator/data/regulator_repository.dart';
import 'package:medverify/features/regulator/domain/regulator_models.dart';
import 'package:medverify/features/regulator/presentation/providers/regulator_providers.dart';
import 'package:medverify/features/scan/domain/entities/scan_result.dart';
import 'package:medverify/features/session/data/repositories/session_repository_impl.dart';
import 'package:medverify/features/session/domain/entities/device.dart';
import 'package:medverify/features/session/domain/entities/token_pair.dart';
import 'package:medverify/features/session/presentation/providers/session_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockRepository extends Mock implements RegulatorRepository {}

class _MockSession extends Mock implements SessionRepositoryImpl {}

class _Registered extends SessionController {
  @override
  Future<void> build() async {}
}

const _public = Device(id: 'd-1', role: DeviceRole.public, language: AppLanguage.en);
const _regulator = Device(id: 'd-1', role: DeviceRole.regulator, language: AppLanguage.en);
const _tokens = TokenPair(accessToken: 'new-access', refreshToken: 'new-refresh');

void main() {
  late _MockRepository repository;
  late _MockSession session;
  late ProviderContainer container;

  setUpAll(() => registerFallbackValue(_tokens));

  setUp(() {
    repository = _MockRepository();
    session = _MockSession();
    when(() => repository.me()).thenAnswer((_) async => const Success(_public));
    when(() => session.adoptTokens(any())).thenAnswer((_) async {});
    container = ProviderContainer.test(
      overrides: [
        regulatorRepositoryProvider.overrideWithValue(repository),
        sessionRepositoryProvider.overrideWithValue(session),
        sessionControllerProvider.overrideWith(_Registered.new),
      ],
    );
  });

  group('regulator mode', () {
    test('the right PIN switches to regulator and stores the new tokens', () async {
      when(() => repository.elevate('246810'))
          .thenAnswer((_) async => const Success((device: _regulator, tokens: _tokens)));
      expect(container.read(isRegulatorProvider), isFalse);
      await container.read(deviceRoleProvider.future);

      final error = await container.read(deviceRoleProvider.notifier).unlock(' 246810 ');

      expect(error, isNull);
      verify(() => session.adoptTokens(_tokens)).called(1);
      expect(container.read(isRegulatorProvider), isTrue);
    });

    test('a wrong PIN keeps public mode and says why', () async {
      when(() => repository.elevate(any()))
          .thenAnswer((_) async => const Err(ForbiddenFailure('Incorrect PIN', code: 'INVALID_PIN')));
      await container.read(deviceRoleProvider.future);

      expect(await container.read(deviceRoleProvider.notifier).unlock('000000'), 'Incorrect PIN');
      verifyNever(() => session.adoptTokens(any()));
      expect(container.read(isRegulatorProvider), isFalse);
    });

    test('leaving goes back to public with new tokens', () async {
      when(() => repository.me()).thenAnswer((_) async => const Success(_regulator));
      when(() => repository.demote()).thenAnswer((_) async => const Success((device: _public, tokens: _tokens)));
      await container.read(deviceRoleProvider.future);
      expect(container.read(isRegulatorProvider), isTrue);

      expect(await container.read(deviceRoleProvider.notifier).leave(), isNull);
      expect(container.read(isRegulatorProvider), isFalse);
    });

    test('offline at launch: treated as public (the server checks every regulator call anyway)', () async {
      when(() => repository.me()).thenAnswer((_) async => const Err(NetworkFailure()));
      await container.read(deviceRoleProvider.future);
      expect(container.read(isRegulatorProvider), isFalse);
    });
  });

  group('review decisions', () {
    test('disagree needs a verdict before it can be saved', () {
      final sub = container.listen(decisionDraftProvider('r-1'), (_, _) {});
      addTearDown(sub.close);
      final draft = container.read(decisionDraftProvider('r-1').notifier);

      expect(sub.read().canSubmit, isFalse);
      draft.choose(ReviewDecision.agree);
      expect(sub.read().canSubmit, isTrue);
      draft.choose(ReviewDecision.disagree);
      expect(sub.read().canSubmit, isFalse);
      draft.chooseVerdict(Verdict.highRisk);
      expect(sub.read().canSubmit, isTrue);
      // Switching away from disagree drops the verdict (the server rejects it otherwise).
      draft.choose(ReviewDecision.inconclusive);
      expect(sub.read().verdict, isNull);
    });

    test('a review parses with what the AI read, signals and the reference photo', () {
      final item = ReviewItem.fromJson({
        'id': 'r-1',
        'status': 'claimed',
        'priority': 2,
        'reasons': ['SUSPICIOUS', 'TEXT_ANOMALIES'],
        'slaDeadline': '2026-11-02T10:00:00.000Z',
        'escalationLevel': 1,
        'claimedBy': 'd-1',
        'scan': {
          'verdict': 'suspicious',
          'riskScore': 40,
          'productName': 'DEMOQUINE',
          'signals': [
            {'code': 'TEXT_ANOMALIES', 'label': 'Spelling', 'weight': 20, 'severity': 'warning'},
          ],
          'extracted': {
            'label': {
              'nafdac_no': {'value': 'X9-0001', 'confidence': 0.97},
              'is_medicine_pack': true,
            },
          },
          'product': {
            'nafdacNo': 'X9-0001',
            'referenceImages': [
              {'id': 'img-back', 'side': 'back'},
              {'id': 'img-front', 'side': 'front'},
            ],
          },
        },
      });
      expect(item.verdict, Verdict.suspicious);
      expect(item.label['nafdac_no'], ('X9-0001', 0.97));
      expect(item.label.containsKey('is_medicine_pack'), isFalse);
      expect(item.referenceImageId, 'img-front');
      expect(item.registeredProduct, 'X9-0001');
      expect(item.signals.single.weight, 20);
    });
  });
}
