import 'package:equatable/equatable.dart';

import '../../../../core/constants/app_language.dart';

enum DeviceRole {
  public,
  regulator;

  static DeviceRole fromName(String? name) => name == 'regulator' ? regulator : public;
}

/// This install of the app, as the server knows it. There are no user
/// accounts — the device is the identity.
class Device extends Equatable {
  const Device({required this.id, required this.role, required this.language});

  final String id;
  final DeviceRole role;
  final AppLanguage language;

  bool get isRegulator => role == DeviceRole.regulator;

  @override
  List<Object?> get props => [id, role, language];
}
