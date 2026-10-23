import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/storage/preferences_store.dart';
import 'package:medverify/core/storage/storage_providers.dart';
import 'package:medverify/core/theme/app_theme.dart';
import 'package:medverify/features/onboarding/presentation/providers/onboarding_providers.dart';
import 'package:medverify/features/onboarding/presentation/screens/onboarding_screen.dart';
import 'package:mocktail/mocktail.dart';

class _MockPreferences extends Mock implements PreferencesStore {}

void main() {
  setUpAll(() => registerFallbackValue(AppLanguage.en));

  testWidgets('walks through the three slides and completes onboarding', (tester) async {
    // A typical phone: 390 × 844 logical pixels.
    tester.view
      ..physicalSize = const Size(1170, 2532)
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final prefs = _MockPreferences();
    when(() => prefs.language).thenReturn(AppLanguage.en);
    when(() => prefs.onboardingDone).thenReturn(false);
    when(() => prefs.setLanguage(any())).thenAnswer((_) async {});
    when(() => prefs.setOnboardingDone()).thenAnswer((_) async {});

    await tester.pumpWidget(
      ProviderScope(
        overrides: [preferencesStoreProvider.overrideWithValue(prefs)],
        child: MaterialApp(theme: AppTheme.light(), home: const OnboardingScreen()),
      ),
    );

    expect(find.text('Verify a medicine before you take it'), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Choose your language'), findsOneWidget);

    await tester.ensureVisible(find.text('Yorùbá'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yorùbá'));
    await tester.pump();

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Get started'), findsOneWidget);

    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();

    verify(() => prefs.setLanguage(AppLanguage.yo)).called(1);
    final container = ProviderScope.containerOf(tester.element(find.byType(OnboardingScreen)));
    expect(container.read(onboardingDoneProvider), isTrue);
  });
}
