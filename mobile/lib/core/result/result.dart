import '../errors/failure.dart';

/// The outcome of anything that can fail: a value or a [Failure].
/// Repositories return it instead of throwing, so callers must handle both:
///
///   switch (await repo.load()) {
///     case Success(:final value): ...
///     case Err(:final failure): ...
///   }
sealed class Result<T> {
  const Result();

  bool get isSuccess => this is Success<T>;

  /// The value, or null on failure.
  T? get valueOrNull => switch (this) {
    Success(:final value) => value,
    Err() => null,
  };

  Result<R> map<R>(R Function(T value) transform) => switch (this) {
    Success(:final value) => Success(transform(value)),
    Err(:final failure) => Err(failure),
  };
}

final class Success<T> extends Result<T> {
  const Success(this.value);
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.failure);
  final Failure failure;
}
