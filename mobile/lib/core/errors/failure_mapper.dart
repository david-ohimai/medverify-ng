import 'package:dio/dio.dart';

import '../network/api_envelope.dart';
import 'failure.dart';

/// Turns any error from the network layer into a [Failure] the UI can show.
/// The server's own message is used when it sent the standard envelope.
Failure mapDioException(DioException error) {
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
      return const TimeoutFailure();
    case DioExceptionType.connectionError:
      return const NetworkFailure();
    case DioExceptionType.cancel:
      return const UnexpectedFailure('The request was cancelled.');
    case DioExceptionType.badCertificate:
      return const NetworkFailure('Could not verify the server. Check your connection.');
    case DioExceptionType.badResponse:
    case DioExceptionType.unknown:
      final response = error.response;
      if (response == null) return const NetworkFailure();
      return mapStatus(
        response.statusCode ?? 0,
        ApiEnvelope.tryParse(response.data),
        retryAfterHeader: response.headers.value('retry-after'),
      );
    case DioExceptionType.transformTimeout:
      // TODO: Handle this case.
      throw UnimplementedError();
  }
}

Failure mapStatus(int status, ApiEnvelope? envelope, {String? retryAfterHeader}) {
  final message = (envelope?.message.isNotEmpty ?? false) ? envelope!.message : null;
  final code = envelope?.code;

  return switch (status) {
    401 => UnauthorizedFailure(message ?? 'Your session has ended.', code),
    403 => ForbiddenFailure(message ?? 'You are not allowed to do that.', code: code),
    404 => NotFoundFailure(message ?? 'Not found.'),
    400 || 409 || 422 => ValidationFailure(
      message ?? 'Please check what you entered.',
      fieldErrors: envelope?.errors ?? const [],
      code: code,
    ),
    429 => RateLimitedFailure(
      message ?? 'Too many attempts. Please wait a moment.',
      retryAfter: _parseRetryAfter(retryAfterHeader),
    ),
    >= 500 => ServerFailure('Something went wrong on our side. Please try again.', status),
    _ => UnexpectedFailure(message ?? 'Something unexpected happened.'),
  };
}

Duration? _parseRetryAfter(String? header) {
  final seconds = int.tryParse(header ?? '');
  return seconds == null ? null : Duration(seconds: seconds);
}
