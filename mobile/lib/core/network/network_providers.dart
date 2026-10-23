import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/env.dart';
import '../constants/app_constants.dart';
import 'api_client.dart';
import 'auth_token_source.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/safe_log_interceptor.dart';

BaseOptions _baseOptions() => BaseOptions(
  baseUrl: Env.apiBaseUrl,
  connectTimeout: AppConstants.connectTimeout,
  receiveTimeout: AppConstants.receiveTimeout,
  sendTimeout: AppConstants.sendTimeout,
  contentType: Headers.jsonContentType,
  responseType: ResponseType.json,
  // Let ApiClient read the envelope of 4xx/5xx responses instead of throwing.
  validateStatus: (status) => status != null && status < 500,
);

/// Implemented by the session feature and wired in bootstrap.dart, so core
/// never imports a feature.
final authTokenSourceProvider = Provider<AuthTokenSource>(
  (ref) => throw UnimplementedError('authTokenSourceProvider must be overridden in bootstrap'),
);

/// Dio without auth: registration, refresh, and replaying requests after a refresh.
final publicDioProvider = Provider<Dio>((ref) {
  final dio = Dio(_baseOptions());
  if (kDebugMode) dio.interceptors.add(SafeLogInterceptor());
  ref.onDispose(dio.close);
  return dio;
});

/// Dio for everything that needs the device's access token.
final authenticatedDioProvider = Provider<Dio>((ref) {
  // 401s must reach the interceptor as errors so it can refresh and replay.
  final dio = Dio(_baseOptions()..validateStatus = (status) => status != null && status < 400);
  dio.interceptors.addAll([
    AuthInterceptor(tokens: ref.watch(authTokenSourceProvider), retryClient: ref.watch(publicDioProvider)),
    if (kDebugMode) SafeLogInterceptor(),
  ]);
  ref.onDispose(dio.close);
  return dio;
});

final publicApiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(publicDioProvider)));

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(authenticatedDioProvider)));
