import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/features/home/presentation/providers/home_providers.dart';

String _greetingAt(int hour) {
  final container = ProviderContainer.test(
    overrides: [clockProvider.overrideWithValue(() => DateTime(2026, 10, 23, hour))],
  );
  return container.read(greetingProvider);
}

void main() {
  test('greeting follows the time of day', () {
    expect(_greetingAt(7), 'Good morning');
    expect(_greetingAt(13), 'Good afternoon');
    expect(_greetingAt(20), 'Good evening');
  });

  test('Home shows 3 different random tips, and a new set on shuffle', () {
    final container = ProviderContainer.test(overrides: [randomProvider.overrideWithValue(Random(1))]);
    final first = container.read(homeInsightsProvider);
    expect(first, hasLength(3));
    expect(first.toSet(), hasLength(3));
    expect(homeTips, containsAll(first));

    // Shuffling enough times shows tips beyond the first three.
    final seen = {...first};
    for (var i = 0; i < 20; i++) {
      container.read(homeInsightsProvider.notifier).shuffle();
      seen.addAll(container.read(homeInsightsProvider));
    }
    expect(seen.length, greaterThan(6));
  });
}
