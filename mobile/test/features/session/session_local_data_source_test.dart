import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/storage_keys.dart';
import 'package:medverify/core/storage/secure_store.dart';
import 'package:medverify/features/session/data/datasources/session_local_data_source.dart';
import 'package:mocktail/mocktail.dart';

class _MockSecureStore extends Mock implements SecureStore {}

void main() {
  test('concurrent first calls share one install id — never two different devices', () async {
    final store = _MockSecureStore();
    final firstRead = Completer<String?>();
    when(() => store.read(StorageKeys.installId)).thenAnswer((_) => firstRead.future);
    when(() => store.write(StorageKeys.installId, any())).thenAnswer((_) async {});
    final local = SessionLocalDataSource(store);

    final ids = [local.installId(), local.installId(), local.installId()];
    firstRead.complete(null);
    final results = await Future.wait(ids);

    expect(results.toSet(), hasLength(1));
    verify(() => store.read(StorageKeys.installId)).called(1);
    verify(() => store.write(StorageKeys.installId, results.first)).called(1);
  });

  test('a failed read is not cached: the next call tries again', () async {
    final store = _MockSecureStore();
    var calls = 0;
    when(() => store.read(StorageKeys.installId)).thenAnswer((_) async {
      calls++;
      if (calls == 1) throw Exception('Keystore unavailable');
      return 'install-1';
    });
    final local = SessionLocalDataSource(store);

    await expectLater(local.installId(), throwsException);
    expect(await local.installId(), 'install-1');
  });
}
