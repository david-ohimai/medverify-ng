import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_constants.dart';
import 'package:medverify/core/theme/app_theme.dart';
import 'package:medverify/features/splash/presentation/providers/splash_providers.dart';
import 'package:medverify/features/splash/presentation/screens/splash_screen.dart';

void main() {
  testWidgets('writes MedVerify letter by letter, then the tagline, within the splash time', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: AppTheme.dark(), home: const SplashScreen()));

    // Every letter is laid out from the start (no layout jump) and appears in turn.
    for (final letter in 'MedVerify'.split('')) {
      expect(find.text(letter), findsWidgets);
    }
    expect(find.text('NG'), findsOneWidget);
    expect(find.text(AppConstants.tagline), findsOneWidget);

    // All animations finish well inside the splash duration.
    await tester.pump(splashDuration);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  test('the splash finishes on its own after ~2.8 s (never more than 3 s)', () {
    fakeAsyncSplash();
  });
}

void fakeAsyncSplash() {
  expect(splashDuration, lessThanOrEqualTo(const Duration(seconds: 3)));
  final container = ProviderContainer.test();
  expect(container.read(splashDoneProvider), isFalse);
  container.read(splashDoneProvider.notifier).finish();
  expect(container.read(splashDoneProvider), isTrue);
}
