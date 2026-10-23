import 'package:dio/dio.dart';

import '../api_envelope.dart';
import '../auth_token_source.dart';

/// Adds the access token to every request, and on a 401 recovers the
/// session once (refresh, or re-register) and replays the request.
///
/// Requests made while recovering wait for the same recovery — the
/// [AuthTokenSource] guarantees a single refresh in flight.
///
/// Every path ends in exactly one handler call (next / resolve / reject):
/// an exception escaping an async interceptor would leave the request
/// hanging forever.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this._tokens, required this._retryClient});

  final AuthTokenSource _tokens;

  /// A Dio without this interceptor, so a replayed request can't loop.
  final Dio _retryClient;

  static const _retriedFlag = 'auth_retried';

  /// Server codes that mean "this token is no good, get a new one".
  static const _tokenProblemCodes = {'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_MISSING', 'TOKEN_REVOKED'};

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final String? token;
    try {
      token = await _tokens.accessToken();
    } catch (error) {
      // e.g. Keystore unreadable after a restore, or Keychain locked before first unlock.
      handler.reject(
        DioException(requestOptions: options, error: TokenStorageException(error), type: DioExceptionType.unknown),
      );
      return;
    }
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

    final failedToken = _bearerOf(options);
    final String? newToken;
    try {
      newToken = await _tokens.recoverAfterUnauthorized(failedToken: failedToken);
    } catch (_) {
      handler.next(err);
      return;
    }
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
    } catch (error) {
      handler.next(DioException(requestOptions: options, error: error));
    }
  }

  bool _isTokenProblem(Object? body) => _tokenProblemCodes.contains(ApiEnvelope.tryParse(body)?.code);

  String? _bearerOf(RequestOptions options) {
    final header = options.headers['Authorization'];
    return header is String && header.startsWith('Bearer ') ? header.substring(7) : null;
  }
}
