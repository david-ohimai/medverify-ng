import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/constants/app_language.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/result/result.dart';
import 'package:medverify/features/session/data/datasources/session_local_data_source.dart';
import 'package:medverify/features/session/data/datasources/session_remote_data_source.dart';
import 'package:medverify/features/session/data/device_info.dart';
import 'package:medverify/features/session/data/repositories/session_repository_impl.dart';
import 'package:medverify/features/session/domain/entities/device.dart';
import 'package:medverify/features/session/domain/entities/token_pair.dart';
import 'package:mocktail/mocktail.dart';

class _MockRemote extends Mock implements SessionRemoteDataSource {}

class _MockLocal extends Mock implements SessionLocalDataSource {}

const _device = Device(id: 'device-1', role: DeviceRole.public, language: AppLanguage.en);
const _oldPair = TokenPair(accessToken: 'old-access', refreshToken: 'old-refresh');
const _newPair = TokenPair(accessToken: 'new-access', refreshToken: 'new-refresh');

void main() {
  late _MockRemote remote;
  late _MockLocal local;
  late SessionRepositoryImpl repository;

  setUpAll(() {
    registerFallbackValue(_oldPair);
    registerFallbackValue(AppLanguage.en);
  });

  setUp(() {
    remote = _MockRemote();
    local = _MockLocal();
    repository = SessionRepositoryImpl(
      remote: remote,
      local: local,
      deviceInfo: () async => const DeviceInfo(platform: 'android', appVersion: '1.0.0+1'),
      language: () => AppLanguage.yo,
    );
    when(() => local.installId()).thenAnswer((_) async => 'install-1');
    when(() => local.saveTokens(any())).thenAnswer((_) async {});
    when(() => local.clearTokens()).thenAnswer((_) async {});
  });

  void stubRegister() => when(
    () => remote.register(
      installId: any(named: 'installId'),
      platform: any(named: 'platform'),
      appVersion: any(named: 'appVersion'),
      language: any(named: 'language'),
    ),
  ).thenAnswer((_) async => const Success((device: _device, tokens: _newPair)));

  group('ensureRegistered', () {
    test('first launch: registers with the install id, platform, version and language, then saves the tokens', () async {
      when(() => local.refreshToken()).thenAnswer((_) async => null);
      stubRegister();

      final result = await repository.ensureRegistered();

      expect(result.valueOrNull, _device);
      verify(
        () => remote.register(installId: 'install-1', platform: 'android', appVersion: '1.0.0+1', language: AppLanguage.yo),
      ).called(1);
      verify(() => local.saveTokens(_newPair)).called(1);
    });

    test('later launches: does nothing — no network call at startup', () async {
      when(() => local.refreshToken()).thenAnswer((_) async => 'old-refresh');

      final result = await repository.ensureRegistered();

      expect(result, isA<Success<Device?>>());
      verifyNever(
        () => remote.register(
          installId: any(named: 'installId'),
          platform: any(named: 'platform'),
          appVersion: any(named: 'appVersion'),
          language: any(named: 'language'),
        ),
      );
    });
  });

  group('recoverAfterUnauthorized', () {
    test('refreshes and returns the new access token', () async {
      when(() => local.refreshToken()).thenAnswer((_) async => 'old-refresh');
      when(() => remote.refresh('old-refresh')).thenAnswer((_) async => const Success(_newPair));

      expect(await repository.recoverAfterUnauthorized(), 'new-access');
      verify(() => local.saveTokens(_newPair)).called(1);
    });

    test('concurrent 401s share ONE refresh — the refresh token is used once', () async {
      final gate = Completer<Result<TokenPair>>();
      when(() => local.refreshToken()).thenAnswer((_) async => 'old-refresh');
      when(() => remote.refresh('old-refresh')).thenAnswer((_) => gate.future);

      final calls = [repository.recoverAfterUnauthorized(), repository.recoverAfterUnauthorized(), repository.recoverAfterUnauthorized()];
      gate.complete(const Success(_newPair));

      expect(await Future.wait(calls), ['new-access', 'new-access', 'new-access']);
      verify(() => remote.refresh('old-refresh')).called(1);
    });

    test('a rejected refresh token (e.g. REFRESH_REUSED) clears the session and re-registers', () async {
      when(() => local.refreshToken()).thenAnswer((_) async => 'old-refresh');
      when(() => remote.refresh('old-refresh'))
          .thenAnswer((_) async => const Err(UnauthorizedFailure('Refresh token already used', 'REFRESH_REUSED')));
      stubRegister();
      when(() => local.accessToken()).thenAnswer((_) async => 'new-access');

      expect(await repository.recoverAfterUnauthorized(), 'new-access');
      verify(() => local.clearTokens()).called(1);
      verify(() => local.saveTokens(_newPair)).called(1);
    });

    test('offline during refresh keeps the tokens and gives up for now', () async {
      when(() => local.refreshToken()).thenAnswer((_) async => 'old-refresh');
      when(() => remote.refresh('old-refresh')).thenAnswer((_) async => const Err(NetworkFailure()));

      expect(await repository.recoverAfterUnauthorized(), isNull);
      verifyNever(() => local.clearTokens());
    });
  });
}
