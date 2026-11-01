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
const _newPair = TokenPair(accessToken: 'new-access', refreshToken: 'new-refresh');

void main() {
  late _MockRemote remote;
  late _MockLocal local;
  late SessionRepositoryImpl repository;

  setUpAll(() {
    registerFallbackValue(_newPair);
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

  void stubRegister([Future<Result<({Device device, TokenPair tokens})>> Function()? answer]) => when(
    () => remote.register(
      installId: any(named: 'installId'),
      platform: any(named: 'platform'),
      appVersion: any(named: 'appVersion'),
      language: any(named: 'language'),
    ),
  ).thenAnswer((_) => answer?.call() ?? Future.value(const Success((device: _device, tokens: _newPair))));

  void verifyRegisterCalled(int times) => verify(
    () => remote.register(
      installId: any(named: 'installId'),
      platform: any(named: 'platform'),
      appVersion: any(named: 'appVersion'),
      language: any(named: 'language'),
    ),
  ).called(times);

  /// Simulates secure storage: what the repository saves is what it reads back.
  void storeTokensInMemory({String? access, String? refresh}) {
    var accessToken = access;
    var refreshToken = refresh;
    when(() => local.accessToken()).thenAnswer((_) async => accessToken);
    when(() => local.refreshToken()).thenAnswer((_) async => refreshToken);
    when(() => local.saveTokens(any())).thenAnswer((invocation) async {
      final pair = invocation.positionalArguments.first as TokenPair;
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
    });
    when(() => local.clearTokens()).thenAnswer((_) async {
      accessToken = null;
      refreshToken = null;
    });
  }

  group('ensureRegistered', () {
    test(
      'first launch: registers with the install id, platform, version and language, then saves the tokens',
      () async {
        storeTokensInMemory();
        stubRegister();

        final result = await repository.ensureRegistered();

        expect(result.valueOrNull, _device);
        verify(
          () => remote.register(
            installId: 'install-1',
            platform: 'android',
            appVersion: '1.0.0+1',
            language: AppLanguage.yo,
          ),
        ).called(1);
        verify(() => local.saveTokens(_newPair)).called(1);
      },
    );

    test('later launches: does nothing, no network call at startup', () async {
      storeTokensInMemory(access: 'old-access', refresh: 'old-refresh');

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

    test('first launch race: a 401 during registration waits for it instead of registering again', () async {
      storeTokensInMemory();
      final gate = Completer<Result<({Device device, TokenPair tokens})>>();
      stubRegister(() => gate.future);

      final registration = repository.ensureRegistered();
      // A screen's request got TOKEN_MISSING before registration finished.
      final recovered = repository.recoverAfterUnauthorized(failedToken: null);
      gate.complete(const Success((device: _device, tokens: _newPair)));

      expect((await registration).valueOrNull, _device);
      expect(await recovered, 'new-access');
      verifyRegisterCalled(1);
      verifyNever(() => remote.refresh(any()));
    });
  });

  group('recoverAfterUnauthorized', () {
    test('refreshes and returns the new access token', () async {
      storeTokensInMemory(access: 'old-access', refresh: 'old-refresh');
      when(() => remote.refresh('old-refresh')).thenAnswer((_) async => const Success(_newPair));

      expect(await repository.recoverAfterUnauthorized(failedToken: 'old-access'), 'new-access');
      verify(() => local.saveTokens(_newPair)).called(1);
    });

    test('concurrent 401s share ONE refresh, the refresh token is used once', () async {
      storeTokensInMemory(access: 'old-access', refresh: 'old-refresh');
      final gate = Completer<Result<TokenPair>>();
      when(() => remote.refresh('old-refresh')).thenAnswer((_) => gate.future);

      final calls = [
        repository.recoverAfterUnauthorized(failedToken: 'old-access'),
        repository.recoverAfterUnauthorized(failedToken: 'old-access'),
        repository.recoverAfterUnauthorized(failedToken: 'old-access'),
      ];
      gate.complete(const Success(_newPair));

      expect(await Future.wait(calls), ['new-access', 'new-access', 'new-access']);
      verify(() => remote.refresh('old-refresh')).called(1);
    });

    test('a late 401 for a token that was already replaced reuses the new token', () async {
      storeTokensInMemory(access: 'new-access', refresh: 'new-refresh');

      expect(await repository.recoverAfterUnauthorized(failedToken: 'old-access'), 'new-access');
      verifyNever(() => remote.refresh(any()));
    });

    test('a rejected refresh token (e.g. REFRESH_REUSED) clears the session and re-registers', () async {
      storeTokensInMemory(access: 'old-access', refresh: 'old-refresh');
      when(() => remote.refresh('old-refresh'))
          .thenAnswer((_) async => const Err(UnauthorizedFailure('Refresh token already used', 'REFRESH_REUSED')));
      stubRegister();

      expect(await repository.recoverAfterUnauthorized(failedToken: 'old-access'), 'new-access');
      verify(() => local.clearTokens()).called(1);
      verifyRegisterCalled(1);
    });

    test('offline during refresh keeps the tokens and gives up for now', () async {
      storeTokensInMemory(access: 'old-access', refresh: 'old-refresh');
      when(() => remote.refresh('old-refresh')).thenAnswer((_) async => const Err(NetworkFailure()));

      expect(await repository.recoverAfterUnauthorized(failedToken: 'old-access'), isNull);
      verifyNever(() => local.clearTokens());
    });
  });
}
