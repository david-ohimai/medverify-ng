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
}
