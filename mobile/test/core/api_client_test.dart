import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/network/api_client.dart';
import 'package:medverify/core/result/result.dart';

/// Answers every request with a canned response, or throws a connection error.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter({this.status = 200, this.body, this.offline = false});

  final int status;
  final Object? body;
  final bool offline;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (offline) {
      throw DioException.connectionError(requestOptions: options, reason: 'offline');
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(_FakeAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test', validateStatus: (s) => s != null && s < 500))
    ..httpClientAdapter = adapter;
  return ApiClient(dio);
}

Map<String, Object?> _envelope({
  required bool success,
  required int status,
  Object? data,
  String? code,
  String message = '',
}) => {
  'success': success,
  'message': message,
  'statusCode': status,
  'code': code,
  'data': data,
  'errors': <Object>[],
  'meta': null,
};

void main() {
  test('success: parses the envelope data', () async {
    final client = _client(_FakeAdapter(body: _envelope(success: true, status: 200, data: {'id': 'device-1'})));

    final result = await client.get('/devices/me', parse: (data) => (data as Map<String, dynamic>)['id'] as String);

    expect(result, isA<Success<String>>());
    expect(result.valueOrNull, 'device-1');
  });

  test('4xx envelope becomes a typed failure', () async {
    final client = _client(
      _FakeAdapter(
        status: 403,
        body: _envelope(success: false, status: 403, code: 'INVALID_PIN', message: 'Incorrect PIN'),
      ),
    );

    final result = await client.post('/devices/me/elevate', body: {'pin': '111111'}, parse: (_) => null);

    final failure = (result as Err).failure;
    expect(failure, isA<ForbiddenFailure>());
    expect(failure.message, 'Incorrect PIN');
  });

  test('no connection becomes NetworkFailure', () async {
    final client = _client(_FakeAdapter(offline: true));
    final result = await client.get('/devices/me', parse: (data) => data);
    expect((result as Err).failure, isA<NetworkFailure>());
  });

  test('a body that does not match the parser is a failure, not a crash', () async {
    final client = _client(_FakeAdapter(body: _envelope(success: true, status: 200, data: {'id': 42})));
    final result = await client.get('/devices/me', parse: (data) => (data as Map<String, dynamic>)['id'] as String);
    expect((result as Err).failure, isA<UnexpectedFailure>());
  });
}
