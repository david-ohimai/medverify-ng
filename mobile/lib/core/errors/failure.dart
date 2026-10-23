import 'package:equatable/equatable.dart';

/// A field-level problem returned by the API's validation (422).
class FieldError extends Equatable {
  const FieldError({required this.message, this.field});

  final String? field;
  final String message;

  @override
  List<Object?> get props => [field, message];
}

/// Everything that can go wrong, as values the UI can switch over.
/// [message] is always safe to show to the user.
sealed class Failure extends Equatable {
  const Failure(this.message, {this.code});

  final String message;

  /// The server's machine-readable code (e.g. TOKEN_EXPIRED), when there is one.
  final String? code;

  @override
  List<Object?> get props => [message, code];
}

final class NetworkFailure extends Failure {
  const NetworkFailure([
    super.message = 'No internet connection. Check your network and try again.',
  ]) : super(code: 'NETWORK');
}

final class TimeoutFailure extends Failure {
  const TimeoutFailure([
    super.message = 'The server is taking too long. Please try again.',
  ]) : super(code: 'TIMEOUT');
}

final class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure([super.message = 'Your session has ended.', String? code])
    : super(code: code ?? 'UNAUTHORISED');
}

final class ForbiddenFailure extends Failure {
  const ForbiddenFailure(super.message, {super.code});
}

final class NotFoundFailure extends Failure {
  const NotFoundFailure([super.message = 'Not found.']) : super(code: 'NOT_FOUND');
}

final class ValidationFailure extends Failure {
  const ValidationFailure(super.message, {this.fieldErrors = const [], super.code});

  final List<FieldError> fieldErrors;

  @override
  List<Object?> get props => [...super.props, fieldErrors];
}

final class RateLimitedFailure extends Failure {
  const RateLimitedFailure(super.message, {this.retryAfter}) : super(code: 'RATE_LIMITED');

  final Duration? retryAfter;

  @override
  List<Object?> get props => [...super.props, retryAfter];
}

final class ServerFailure extends Failure {
  const ServerFailure([
    super.message = 'Something went wrong on our side. Please try again.',
    this.statusCode,
  ]) : super(code: 'SERVER');

  final int? statusCode;

  @override
  List<Object?> get props => [...super.props, statusCode];
}

final class StorageFailure extends Failure {
  const StorageFailure([super.message = 'Could not read saved data on this phone.'])
    : super(code: 'STORAGE');
}

final class UnexpectedFailure extends Failure {
  const UnexpectedFailure([super.message = 'Something unexpected happened.'])
    : super(code: 'UNEXPECTED');
}
