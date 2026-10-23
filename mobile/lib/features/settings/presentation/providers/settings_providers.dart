import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Which settings tab is open. Reset when the screen is disposed.
final settingsTabProvider = NotifierProvider.autoDispose<SettingsTab, int>(SettingsTab.new);

class SettingsTab extends Notifier<int> {
  @override
  int build() => 0;

  void select(int index) => state = index;
}

/// "1.0.0 (1)" — loaded once from the platform.
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return info.buildNumber.isEmpty ? info.version : '${info.version} (${info.buildNumber})';
});
