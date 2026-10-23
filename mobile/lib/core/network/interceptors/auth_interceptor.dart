import 'package:dio/dio.dart';

import '../api_envelope.dart';
import '../auth_token_source.dart';

/// Adds the access token to every request, and on a 401 recovers the
/// session once (refresh, or re-register) and replays the request.
///
/// Requests made while recovering wait for the same recovery — the
/// [AuthTokenSource] guarantees a single refresh in flight.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this._tokens, required this._retryClient});

  final AuthTokenSource _tokens;

  /// A Dio without this interceptor, so a replayed request can't loop.
  final Dio _retryClient;

  static const _retriedFlag = 'auth_retried';

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _tokens.accessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final isUnauthorized = err.response?.statusCode == 401;
    final alreadyRetried = options.extra[_retriedFlag] == true;

    if (!isUnauthorized || alreadyRetried || !_isTokenProblem(err.response?.data)) {
      handler.next(err);
      return;
    }

    final newToken = await _tokens.recoverAfterUnauthorized();
    if (newToken == null) {
      handler.next(err);
      return;
    }

    try {
      options.headers['Authorization'] = 'Bearer $newToken';
      options.extra[_retriedFlag] = true;
      final response = await _retryClient.fetch<Object?>(options);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  /// Only token problems are worth a refresh; other 401s are passed through.
  bool _isTokenProblem(Object? body) {
    final code = ApiEnvelope.tryParse(body)?.code;
    return code == 'TOKEN_EXPIRED' || code == 'TOKEN_INVALID' || code == 'TOKEN_MISSING';
  }
}
