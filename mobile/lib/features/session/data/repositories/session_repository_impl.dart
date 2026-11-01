import 'dart:async';

import '../../../../core/constants/app_language.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/network/auth_token_source.dart';
import '../../../../core/result/result.dart';
import '../../domain/entities/device.dart';
import '../../domain/entities/token_pair.dart';
import '../../domain/repositories/session_repository.dart';
import '../datasources/session_local_data_source.dart';
import '../datasources/session_remote_data_source.dart';
import '../device_info.dart';

/// Owns the device session: silent registration, token storage, and recovery
/// after a 401. Also the [AuthTokenSource] the network layer uses.
///
/// Every operation that reads or writes the session (registration at launch,
/// recovery after a 401) runs one at a time through [_exclusive], so two of
/// them can never register twice or overwrite each other's tokens.
class SessionRepositoryImpl implements SessionRepository, AuthTokenSource {
  SessionRepositoryImpl({
    required this._remote,
    required this._local,
    required this._deviceInfo,
    required this._language,
  });

  final SessionRemoteDataSource _remote;
  final SessionLocalDataSource _local;
  final Future<DeviceInfo> Function() _deviceInfo;
  final AppLanguage Function() _language;

  /// The end of the queue of session operations.
  Future<void> _tail = Future.value();

  /// The one recovery in flight. Every request that gets a 401 while it runs
  /// waits for this same future, so the refresh token is used exactly once.
  Future<String?>? _recovery;

  /// Runs [operation] after every earlier session operation has finished.
  Future<T> _exclusive<T>(Future<T> Function() operation) {
    final result = _tail.then((_) => operation());
    // Keep the queue moving even if this operation fails.
    _tail = result.then<void>((_) {}, onError: (_) {});
    return result;
  }

  @override
  Future<Result<Device?>> ensureRegistered() => _exclusive(() async {
    // Registered on an earlier launch: tokens are refreshed lazily on the
    // first 401, so startup never waits for the network.
    if (await _local.refreshToken() != null) return const Success(null);
    return _register();
  });

  @override
  Future<void> adoptTokens(TokenPair tokens) => _exclusive(() => _local.saveTokens(tokens));

  @override
  Future<String?> accessToken() => _local.accessToken();

  @override
  Future<String?> recoverAfterUnauthorized({required String? failedToken}) =>
      _recovery ??= _exclusive(() => _recover(failedToken)).whenComplete(() => _recovery = null);

  Future<String?> _recover(String? failedToken) async {
    // The session moved on while this request was in flight (registration
    // finished, or an earlier recovery already refreshed): use that token.
    final current = await _local.accessToken();
    if (current != null && current != failedToken) return current;

    final refreshToken = await _local.refreshToken();
    if (refreshToken != null) {
      switch (await _remote.refresh(refreshToken)) {
        case Success(:final value):
          await _local.saveTokens(value);
          return value.accessToken;
        case Err(:final failure) when failure is! UnauthorizedFailure:
          // Offline or server trouble: keep the tokens and let the request fail.
          return null;
        case Err():
          // REFRESH_INVALID / EXPIRED / REUSED: this session is over.
          await _local.clearTokens();
      }
    }

    // No usable refresh token: register again (same install id → same device).
    return switch (await _register()) {
      Success() => _local.accessToken(),
      Err() => null,
    };
  }

  /// Only ever called inside [_exclusive].
  Future<Result<Device?>> _register() async {
    final installId = await _local.installId();
    final info = await _deviceInfo();
    final result = await _remote.register(
      installId: installId,
      platform: info.platform,
      appVersion: info.appVersion,
      language: _language(),
    );
    switch (result) {
      case Success(:final value):
        await _local.saveTokens(value.tokens);
        return Success(value.device);
      case Err(:final failure):
        return Err(failure);
    }
  }
}
