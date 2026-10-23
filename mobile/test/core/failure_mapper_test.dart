import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/errors/failure_mapper.dart';
import 'package:medverify/core/network/api_envelope.dart';
import 'package:medverify/core/network/auth_token_source.dart';

void main() {
  group('ApiEnvelope.tryParse', () {
    test('reads the standard envelope, including field errors', () {
      final envelope = ApiEnvelope.tryParse({
        'success': false,
        'message': 'Validation failed',
        'statusCode': 422,
        'code': 'VALIDATION_FAILED',
        'data': null,
        'errors': [
          {'field': 'body.installId', 'message': 'installId must be a UUID v4'},
        ],
        'meta': null,
      });

      expect(envelope, isNotNull);
      expect(envelope!.code, 'VALIDATION_FAILED');
      expect(envelope.errors.single, const FieldError(field: 'body.installId', message: 'installId must be a UUID v4'));
    });

    test('returns null for anything that is not the envelope', () {
      expect(ApiEnvelope.tryParse('<html>Bad gateway</html>'), isNull);
      expect(ApiEnvelope.tryParse({'status': 'ok'}), isNull);
      expect(ApiEnvelope.tryParse(null), isNull);
    });
  });

  group('mapDioException', () {
    final options = RequestOptions(path: '/devices/me');

    test('every timeout type, including transformTimeout, is a TimeoutFailure (never a throw)', () {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.transformTimeout,
      ]) {
        expect(
          mapDioException(DioException(requestOptions: options, type: type)),
          isA<TimeoutFailure>(),
          reason: '$type',
        );
      }
    });

    test('every DioExceptionType maps to a Failure', () {
      for (final type in DioExceptionType.values) {
        expect(
          () => mapDioException(DioException(requestOptions: options, type: type)),
          returnsNormally,
          reason: '$type',
        );
      }
    });

    test('a token that could not be read from secure storage is a StorageFailure', () {
      final error = DioException(requestOptions: options, error: const TokenStorageException('locked'));
      expect(mapDioException(error), isA<StorageFailure>());
    });
  });

  group('mapStatus', () {
    ApiEnvelope envelope(int status, String code, String message) =>
        ApiEnvelope(success: false, message: message, statusCode: status, code: code, data: null);

    test('401 keeps the server code so the app can tell expired from invalid', () {
      final failure = mapStatus(401, envelope(401, 'TOKEN_EXPIRED', 'Access token expired'));
      expect(failure, isA<UnauthorizedFailure>());
      expect(failure.code, 'TOKEN_EXPIRED');
    });

    test('403 INVALID_PIN uses the server message', () {
      final failure = mapStatus(403, envelope(403, 'INVALID_PIN', 'Incorrect PIN'));
      expect(failure, isA<ForbiddenFailure>());
      expect(failure.message, 'Incorrect PIN');
    });

    test('422 becomes a ValidationFailure with field errors', () {
      final failure = mapStatus(
        422,
        const ApiEnvelope(
          success: false,
          message: 'Validation failed',
          statusCode: 422,
          data: null,
          errors: [FieldError(field: 'body.pin', message: 'PIN must be 6-12 digits')],
        ),
      );
      expect(failure, isA<ValidationFailure>());
      expect((failure as ValidationFailure).fieldErrors, hasLength(1));
    });

    test('429 reads Retry-After', () {
      final failure = mapStatus(429, envelope(429, 'RATE_LIMITED', 'Slow down'), retryAfterHeader: '120');
      expect(failure, isA<RateLimitedFailure>());
      expect((failure as RateLimitedFailure).retryAfter, const Duration(seconds: 120));
    });

    test('5xx never shows the server message to the user', () {
      final failure = mapStatus(500, envelope(500, 'INTERNAL_ERROR', 'stack trace here'));
      expect(failure, isA<ServerFailure>());
      expect(failure.message, isNot(contains('stack')));
    });
  });
}
