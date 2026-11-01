import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/locale/language_controller.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/core/speech/tts_service.dart';
import 'package:medverify/features/scan/data/scan_models.dart';
import 'package:medverify/features/scan/data/scan_repository.dart';
import 'package:medverify/features/scan/presentation/providers/listen_providers.dart';
import 'package:medverify/features/scan/presentation/providers/scan_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockRepository extends Mock implements ScanRepository {}

class _MockTts extends Mock implements TtsService {}

class _FixedLanguage extends LanguageController {
  @override
  AppLanguage build() => AppLanguage.pcm;
}

void main() {
  late _MockRepository repository;
  late _MockTts tts;
  late ProviderContainer container;

  setUp(() {
    repository = _MockRepository();
    tts = _MockTts();
    when(() => tts.stop()).thenAnswer((_) async {});
    container = ProviderContainer.test(
      overrides: [
        scanRepositoryProvider.overrideWithValue(repository),
        ttsServiceProvider.overrideWithValue(tts),
        languageProvider.overrideWith(_FixedLanguage.new),
      ],
    );
    container.listen(listenControllerProvider('s-1'), (_, _) {});
  });

  test("starts in the user's language, fetches the translation once, and speaks it", () async {
    when(() => repository.speech('s-1', 'pcm'))
        .thenAnswer((_) async => const Success(SpeechText(text: 'No use dis medicine.', ttsLocale: 'en-NG')));
    when(() => tts.speak(any(), locale: any(named: 'locale'))).thenAnswer((_) async => true);
    final controller = container.read(listenControllerProvider('s-1').notifier);

    expect(container.read(listenControllerProvider('s-1')).language, AppLanguage.pcm);
    await controller.play();
    await controller.play();

    verify(() => repository.speech('s-1', 'pcm')).called(1);
    verify(() => tts.speak('No use dis medicine.', locale: 'en-NG')).called(2);
    expect(container.read(listenControllerProvider('s-1')).text, 'No use dis medicine.');
  });

  test('no voice on the phone: the text is still shown, with a hint', () async {
    when(() => repository.speech('s-1', 'yo'))
        .thenAnswer((_) async => const Success(SpeechText(text: 'Má lò oògùn yìí.', ttsLocale: 'yo-NG')));
    when(() => tts.speak(any(), locale: any(named: 'locale'))).thenAnswer((_) async => false);
    final controller = container.read(listenControllerProvider('s-1').notifier);

    await controller.selectLanguage(AppLanguage.yo);
    await controller.play();

    final state = container.read(listenControllerProvider('s-1'));
    expect(state.text, 'Má lò oògùn yìí.');
    expect(state.voiceMissing, isTrue);
  });

  test('a failed translation shows the reason', () async {
    when(() => repository.speech('s-1', 'pcm')).thenAnswer((_) async => const Err(NetworkFailure()));
    await container.read(listenControllerProvider('s-1').notifier).play();
    expect(container.read(listenControllerProvider('s-1')).error, contains('internet'));
  });

  test('a server fault shows one calm line, not the raw error', () async {
    when(() => repository.speech('s-1', 'pcm'))
        .thenAnswer((_) async => const Err(NotFoundFailure('Route not found: GET /api/v1/scans/s-1/speech')));
    await container.read(listenControllerProvider('s-1').notifier).play();
    final error = container.read(listenControllerProvider('s-1')).error!;
    expect(error, isNot(contains('/api')));
    expect(error, contains('Pidgin'));
  });

  test('English still plays from the verdict on screen when the server fails', () async {
    when(() => repository.get('s-1')).thenAnswer(
      (_) async => Success(
        ScanModels.result({
          'scanId': 's-1',
          'kind': 'photo',
          'status': 'done',
          'verdict': 'unregistered',
          'riskScore': 45,
          'confidence': 'high',
          'headline': 'Not found in the NAFDAC register',
          'advice': "Don't take it until a pharmacist has checked it.",
          'signals': [],
          'checkedAt': '2026-11-01T07:54:51.476Z',
        }),
      ),
    );
    container.listen(scanResultProvider('s-1'), (_, _) {});
    await container.read(scanResultProvider('s-1').future);
    when(() => repository.speech('s-1', 'en')).thenAnswer((_) async => const Err(ServerFailure()));
    when(() => tts.speak(any(), locale: any(named: 'locale'))).thenAnswer((_) async => true);
    final controller = container.read(listenControllerProvider('s-1').notifier);

    await controller.selectLanguage(AppLanguage.en);
    await controller.play();

    verify(
      () => tts.speak(
        "Not found in the NAFDAC register. Don't take it until a pharmacist has checked it.",
        locale: 'en-NG',
      ),
    ).called(1);
    expect(container.read(listenControllerProvider('s-1')).error, isNull);
  });
}
