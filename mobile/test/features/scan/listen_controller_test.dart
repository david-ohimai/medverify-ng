import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/locale/language_controller.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/core/speech/tts_service.dart';
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
}
