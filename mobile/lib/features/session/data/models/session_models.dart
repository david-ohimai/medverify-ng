import '../../../../core/constants/app_language.dart';
import '../../domain/entities/device.dart';
import '../../domain/entities/token_pair.dart';

/// JSON → entities. A missing or wrongly typed field throws a TypeError,
/// which ApiClient turns into a readable failure.
abstract final class SessionModels {
  static Device device(Map<String, dynamic> json) => Device(
    id: json['id'] as String,
    role: DeviceRole.fromName(json['role'] as String?),
    language: AppLanguage.fromCode(json['language'] as String?),
  );

  static TokenPair tokens(Map<String, dynamic> json) =>
      TokenPair(accessToken: json['accessToken'] as String, refreshToken: json['refreshToken'] as String);

  /// `data` of POST /devices/register: { device, tokens }.
  static ({Device device, TokenPair tokens}) session(Object? data) {
    final map = data as Map<String, dynamic>;
    return (
      device: device(map['device'] as Map<String, dynamic>),
      tokens: tokens(map['tokens'] as Map<String, dynamic>),
    );
  }

  /// `data` of POST /devices/refresh: { tokens }.
  static TokenPair refreshed(Object? data) => tokens((data as Map<String, dynamic>)['tokens'] as Map<String, dynamic>);
}
