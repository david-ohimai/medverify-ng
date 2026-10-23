import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/network/api_client.dart';
import 'package:medverify/core/network/auth_token_source.dart';
import 'package:medverify/core/network/interceptors/auth_interceptor.dart';
import 'package:medverify/core/result/result.dart';

/// Returns 401 TOKEN_REVOKED for `Bearer stale`, 200 for anything else.
class _ServerAdapter implements HttpClientAdapter {
  final List<String?> seenTokens = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final auth = options.headers['Authorization'] as String?;
    seenTokens.add(auth);
    final revoked = auth == 'Bearer stale';
    return ResponseBody.fromString(
      jsonEncode({
        'success': !revoked,
        'message': revoked ? 'Access token revoked' : 'ok',
        'statusCode': revoked ? 401 : 200,
        'code': revoked ? 'TOKEN_REVOKED' : null,
        'data': revoked ? null : {'ok': true},
        'errors': <Object>[],
        'meta': null,
      }),
      revoked ? 401 : 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _FakeTokens implements AuthTokenSource {
  _FakeTokens({this.token, this.throwOnRead = false});

  String? token;
  final bool throwOnRead;
  String? lastFailedToken;

  @override
  Future<String?> accessToken() async {
    if (throwOnRead) throw Exception('Keystore unavailable');
    return token;
  }

  @override
  Future<String?> recoverAfterUnauthorized({required String? failedToken}) async {
    lastFailedToken = failedToken;
    return token = 'fresh';
  }
}

(ApiClient, _ServerAdapter) _client(_FakeTokens tokens) {
  final adapter = _ServerAdapter();
  BaseOptions options() => BaseOptions(baseUrl: 'https://api.test');
  final retry = Dio(options())..httpClientAdapter = adapter;
  final dio = Dio(options())
    ..httpClientAdapter = adapter
    ..interceptors.add(AuthInterceptor(tokens: tokens, retryClient: retry));
  return (ApiClient(dio), adapter);
}

void main() {
  test('TOKEN_REVOKED: recovers once with the failed token, then replays the request', () async {
    final tokens = _FakeTokens(token: 'stale');
    final (client, adapter) = _client(tokens);

    final result = await client.get('/devices/me', parse: (data) => data);

    expect(result, isA<Success<Object?>>());
    expect(tokens.lastFailedToken, 'stale');
    expect(adapter.seenTokens, ['Bearer stale', 'Bearer fresh']);
  });

  test('secure storage failing: the request completes with a StorageFailure instead of hanging', () async {
    final (client, adapter) = _client(_FakeTokens(throwOnRead: true));

    final result = await client
        .get('/devices/me', parse: (data) => data)
        .timeout(const Duration(seconds: 2), onTimeout: () => fail('request never completed'));

    expect((result as Err).failure, isA<StorageFailure>());
    expect(adapter.seenTokens, isEmpty);
  });
}
