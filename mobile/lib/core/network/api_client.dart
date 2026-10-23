import 'package:dio/dio.dart';

import '../errors/failure.dart';
import '../errors/failure_mapper.dart';
import '../result/result.dart';
import 'api_envelope.dart';

/// Converts the envelope's `data` into a typed value.
typedef DataParser<T> = T Function(Object? data);

/// Thin wrapper over Dio. Every call returns a [Result] — the envelope's
/// `data` parsed into [T], or a [Failure]. Nothing above this layer sees
/// Dio, JSON or HTTP status codes.
class ApiClient {
  const ApiClient(this._dio);

  final Dio _dio;

  Future<Result<T>> get<T>(String path, {required DataParser<T> parse, Map<String, Object?>? query}) =>
      _send(() => _dio.get<Object?>(path, queryParameters: query), parse);

  Future<Result<T>> post<T>(String path, {required DataParser<T> parse, Object? body}) =>
      _send(() => _dio.post<Object?>(path, data: body), parse);

  Future<Result<T>> patch<T>(String path, {required DataParser<T> parse, Object? body}) =>
      _send(() => _dio.patch<Object?>(path, data: body), parse);

  Future<Result<T>> delete<T>(String path, {required DataParser<T> parse}) =>
      _send(() => _dio.delete<Object?>(path), parse);

  Future<Result<T>> _send<T>(Future<Response<Object?>> Function() request, DataParser<T> parse) async {
    try {
      final response = await request();
      final envelope = ApiEnvelope.tryParse(response.data);
      if (envelope == null || !envelope.success) {
        return Err(mapStatus(response.statusCode ?? 0, envelope));
      }
      return Success(parse(envelope.data));
    } on DioException catch (error) {
      return Err(mapDioException(error));
    } on FormatException {
      return const Err(UnexpectedFailure('The server sent something we could not read.'));
    } on TypeError {
      // A parser met a field of the wrong type: the API and app disagree.
      return const Err(UnexpectedFailure('The server sent something we could not read.'));
    } catch (_) {
      // Anything else (a plugin or interceptor bug): still a Result, never a
      // crash — callers rely on this method not throwing.
      return const Err(UnexpectedFailure());
    }
  }
}
