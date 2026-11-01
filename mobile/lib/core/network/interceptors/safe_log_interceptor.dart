import 'package:dio/dio.dart';

import '../../logging/app_log.dart';

/// Debug-only request/response log (never added in release builds, see
/// network_providers.dart). Shows method, path, status, time and a masked,
/// shortened body, in the Debug Console / terminal / logcat.
class SafeLogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra['startedAt'] = DateTime.now();
    final body = switch (options.data) {
      FormData(:final files, :final fields) =>
        'multipart: ${files.map((f) => '${f.key}=${f.value.filename} (${f.value.length} bytes)').join(', ')}'
            '${fields.isEmpty ? '' : ' ${fields.map((f) => '${f.key}=${f.value}').join(', ')}'}',
      final data => AppLog.body(data),
    };
    final query = options.queryParameters.isEmpty ? '' : ' ?${options.queryParameters}';
    AppLog.api('→ ${options.method} ${options.path}$query $body');
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    final options = response.requestOptions;
    final body = switch (options.responseType) {
      ResponseType.stream => '(event stream, events logged as they arrive)',
      ResponseType.bytes => '(${(response.data as List?)?.length ?? 0} bytes)',
      _ => AppLog.body(response.data),
    };
    AppLog.api('← ${response.statusCode} ${options.method} ${options.path} ${_elapsed(options)} $body');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final options = err.requestOptions;
    final data = err.response?.data;
    AppLog.api(
      '✕ ${err.response?.statusCode ?? err.type.name} ${options.method} ${options.path} ${_elapsed(options)} '
      '${data is ResponseBody ? '' : AppLog.body(data)}${err.message == null ? '' : ', ${err.message}'}',
    );
    handler.next(err);
  }

  String _elapsed(RequestOptions options) {
    final started = options.extra['startedAt'];
    return started is DateTime ? '${DateTime.now().difference(started).inMilliseconds}ms' : '';
  }
}
