import '../errors/failure.dart';

/// The server's response shape, for every endpoint:
///   { success, message, statusCode, code, data, errors, meta }
class ApiEnvelope {
  const ApiEnvelope({
    required this.success,
    required this.message,
    required this.statusCode,
    required this.data,
    this.code,
    this.errors = const [],
  });

  /// Returns null if [json] isn't the envelope (e.g. a proxy's HTML error page).
  static ApiEnvelope? tryParse(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final success = json['success'];
    final statusCode = json['statusCode'];
    if (success is! bool || statusCode is! int) return null;

    final rawErrors = json['errors'];
    return ApiEnvelope(
      success: success,
      message: json['message'] as String? ?? '',
      statusCode: statusCode,
      code: json['code'] as String?,
      data: json['data'],
      errors: rawErrors is List
          ? rawErrors
                .whereType<Map<String, dynamic>>()
                .map(
                  (e) => FieldError(
                    field: e['field'] as String?,
                    message: e['message'] as String? ?? '',
                  ),
                )
                .toList(growable: false)
          : const [],
    );
  }

  final bool success;
  final String message;
  final int statusCode;
  final String? code;
  final Object? data;
  final List<FieldError> errors;
}
