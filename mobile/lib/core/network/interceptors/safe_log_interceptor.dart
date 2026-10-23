import 'dart:developer' as developer;

import 'package:dio/dio.dart';

/// Debug-only request log. Tokens, PINs and install ids are masked, and the
/// interceptor is never added in release builds (see network_providers.dart).
class SafeLogInterceptor extends Interceptor {
  static const _sensitiveKeys = {'authorization', 'accesstoken', 'refreshtoken', 'pin', 'installid'};

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra['startedAt'] = DateTime.now();
    developer.log('→ ${options.method} ${options.path} ${_mask(options.data)}', name: 'api');
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    developer.log(
      '← ${response.statusCode} ${response.requestOptions.path} ${_elapsed(response.requestOptions)}',
      name: 'api',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    developer.log(
      '✕ ${err.response?.statusCode ?? err.type.name} ${err.requestOptions.path} ${_elapsed(err.requestOptions)}',
      name: 'api',
    );
    handler.next(err);
  }

  String _elapsed(RequestOptions options) {
    final started = options.extra['startedAt'];
    return started is DateTime ? '${DateTime.now().difference(started).inMilliseconds}ms' : '';
  }

  Object? _mask(Object? data) {
    if (data is! Map) return data ?? '';
    return {
      for (final entry in data.entries)
        entry.key: _sensitiveKeys.contains('${entry.key}'.toLowerCase()) ? '***' : entry.value,
    };
  }
}
