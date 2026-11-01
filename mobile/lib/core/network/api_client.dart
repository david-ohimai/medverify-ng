import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../errors/failure.dart';
import '../errors/failure_mapper.dart';
import '../logging/app_log.dart';
import '../result/result.dart';
import 'api_envelope.dart';
import 'sse.dart';

/// Converts the envelope's `data` into a typed value.
typedef DataParser<T> = T Function(Object? data);

/// Thin wrapper over Dio. Every call returns a [Result], the envelope's
/// `data` parsed into [T], or a [Failure]. Nothing above this layer sees
/// Dio, JSON or HTTP status codes.
class ApiClient {
  const ApiClient(this._dio);

  final Dio _dio;

  /// Live streams (scan progress, the assistant) can stay open for minutes.
  static const Duration streamTimeout = Duration(minutes: 3);

  Future<Result<T>> get<T>(String path, {required DataParser<T> parse, Map<String, Object?>? query}) =>
      _send(() => _dio.get<Object?>(path, queryParameters: query), parse);

  Future<Result<T>> post<T>(String path, {required DataParser<T> parse, Object? body}) =>
      _send(() => _dio.post<Object?>(path, data: body), parse);

  Future<Result<T>> patch<T>(String path, {required DataParser<T> parse, Object? body}) =>
      _send(() => _dio.patch<Object?>(path, data: body), parse);

  Future<Result<T>> delete<T>(String path, {required DataParser<T> parse}) =>
      _send(() => _dio.delete<Object?>(path), parse);

  /// Multipart upload (a pack photo). Dio sets the multipart content type.
  Future<Result<T>> upload<T>(String path, {required FormData form, required DataParser<T> parse}) => _send(
    () => _dio.post<Object?>(
      path,
      data: form,
      options: Options(sendTimeout: const Duration(minutes: 2)),
    ),
    parse,
  );

  /// Raw bytes (an image). Errors still come back as a [Failure].
  Future<Result<Uint8List>> bytes(String path) async {
    try {
      final response = await _dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
      final status = response.statusCode ?? 0;
      if (status >= 400 || response.data == null) return Err(mapStatus(status, null));
      return Success(Uint8List.fromList(response.data!));
    } on DioException catch (error) {
      return Err(mapDioException(error));
    } catch (_) {
      return const Err(UnexpectedFailure());
    }
  }

  /// A Server-Sent Events stream. Errors (before or during the stream) are
  /// delivered as [Failure]s on the stream, never as Dio exceptions.
  Stream<SseEvent> stream(String path, {Object? body}) async* {
    final Response<ResponseBody> response;
    try {
      final options = Options(
        responseType: ResponseType.stream,
        headers: {'Accept': 'text/event-stream'},
        receiveTimeout: streamTimeout,
      );
      response = body == null
          ? await _dio.get<ResponseBody>(path, options: options)
          : await _dio.post<ResponseBody>(path, data: body, options: options);
    } on DioException catch (error) {
      throw await _streamFailure(error);
    }

    final status = response.statusCode ?? 0;
    final stream = response.data;
    if (status >= 400 || stream == null) {
      throw mapStatus(status, stream == null ? null : ApiEnvelope.tryParse(await _readJson(stream)));
    }
    try {
      yield* parseSse(stream.stream).map((event) {
        AppLog.stream('$path ← ${event.event} ${AppLog.body(event.data)}');
        return event;
      });
    } on DioException catch (error) {
      throw mapDioException(error);
    }
  }

  /// A streamed error response still carries the JSON envelope; read it so the
  /// user sees the server's message (e.g. "Daily question limit reached").
  Future<Failure> _streamFailure(DioException error) async {
    final data = error.response?.data;
    if (data is ResponseBody) {
      return mapStatus(
        error.response!.statusCode ?? 0,
        ApiEnvelope.tryParse(await _readJson(data)),
        retryAfterHeader: error.response!.headers.value('retry-after'),
      );
    }
    return mapDioException(error);
  }

  Future<Object?> _readJson(ResponseBody body) async {
    try {
      return jsonDecode(await utf8.decoder.bind(body.stream).join());
    } catch (_) {
      return null;
    }
  }

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
      // crash, callers rely on this method not throwing.
      return const Err(UnexpectedFailure());
    }
  }
}
