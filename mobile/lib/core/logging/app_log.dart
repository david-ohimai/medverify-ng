import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Debug-only console logging. Uses debugPrint, so lines show in the VS Code
/// Debug Console, the `flutter run` terminal and `adb logcat` (tag: flutter),
/// and long bodies are wrapped instead of dropped. Never prints in release.
///
/// Secrets are masked at any depth: tokens, PINs and install ids.
abstract final class AppLog {
  static const _sensitiveKeys = {'authorization', 'accesstoken', 'refreshtoken', 'pin', 'installid', 'token'};

  /// Bodies are cut here: enough to see what came back, not a wall of JSON.
  static const _maxBody = 1200;

  static void api(String message) => _print('🌐 $message');
  static void stream(String message) => _print('📡 $message');
  static void info(String message) => _print('ℹ️ $message');

  static void _print(String line) {
    if (kDebugMode) debugPrint('[MedVerify] $line', wrapWidth: 1024);
  }

  /// Masks secrets and shortens [data] for a log line.
  static String body(Object? data) {
    if (data == null) return '';
    final masked = mask(data);
    final text = masked is String ? masked : _encode(masked);
    return text.length > _maxBody ? '${text.substring(0, _maxBody)}… (${text.length} chars)' : text;
  }

  static Object? mask(Object? data) => switch (data) {
    Map() => {
      for (final entry in data.entries)
        '${entry.key}': _sensitiveKeys.contains('${entry.key}'.toLowerCase()) ? '***' : mask(entry.value),
    },
    List() => [for (final item in data) mask(item)],
    _ => data,
  };

  static String _encode(Object? value) {
    try {
      return jsonEncode(value);
    } catch (_) {
      return '$value';
    }
  }
}
