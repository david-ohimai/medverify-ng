import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/locale/language_controller.dart';
import 'package:medverify/core/storage/preferences_store.dart';
import 'package:medverify/core/storage/storage_providers.dart';
import 'package:medverify/features/onboarding/presentation/providers/onboarding_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockPreferences extends Mock implements PreferencesStore {}

void main() {
  late _MockPreferences prefs;
  late ProviderContainer container;

  setUpAll(() => registerFallbackValue(AppLanguage.en));

  setUp(() {
    prefs = _MockPreferences();
    when(() => prefs.language).thenReturn(AppLanguage.en);
    when(() => prefs.onboardingDone).thenReturn(false);
    when(() => prefs.setLanguage(any())).thenAnswer((_) async {});
    when(() => prefs.setOnboardingDone()).thenAnswer((_) async {});
    container = ProviderContainer.test(overrides: [preferencesStoreProvider.overrideWithValue(prefs)]);
  });

  test('next() moves forward and stops at the last page', () {
    final controller = container.read(onboardingControllerProvider.notifier);
    // Keep the autoDispose provider alive for the test.
    container.listen(onboardingControllerProvider, (_, _) {});

    controller
      ..next()
      ..next()
      ..next();

    final state = container.read(onboardingControllerProvider);
    expect(state.page, OnboardingController.pageCount - 1);
    expect(state.isLastPage, isTrue);
  });

  test('finish() saves the chosen language and marks onboarding done', () async {
    container.listen(onboardingControllerProvider, (_, _) {});
    final controller = container.read(onboardingControllerProvider.notifier)..selectLanguage(AppLanguage.pcm);

    await controller.finish();

    verify(() => prefs.setLanguage(AppLanguage.pcm)).called(1);
    verify(() => prefs.setOnboardingDone()).called(1);
    expect(container.read(onboardingDoneProvider), isTrue);
    expect(container.read(languageProvider), AppLanguage.pcm);
  });
}
