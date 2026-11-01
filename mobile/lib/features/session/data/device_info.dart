import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Platform and version strings sent with registration.
class DeviceInfo {
  const DeviceInfo({required this.platform, required this.appVersion});

  /// "android" or "ios", the server accepts nothing else.
  final String platform;

  /// "1.0.0+1" (version + build number).
  final String appVersion;

  static Future<DeviceInfo> load() async {
    final package = await PackageInfo.fromPlatform();
    final build = package.buildNumber.isEmpty ? '' : '+${package.buildNumber}';
    return DeviceInfo(
      platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      appVersion: '${package.version}$build',
    );
  }
}
