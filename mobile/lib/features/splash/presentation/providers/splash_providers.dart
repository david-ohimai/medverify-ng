import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// How long the splash stays: long enough for the name to write itself, and
/// never more than ~3 s. Registration runs in the background meanwhile.
const splashDuration = Duration(milliseconds: 2800);

/// Whether the launch splash has finished. The router waits for it.
final splashDoneProvider = NotifierProvider<SplashDone, bool>(SplashDone.new);

class SplashDone extends Notifier<bool> {
  Timer? _timer;

  @override
  bool build() {
    ref.onDispose(() => _timer?.cancel());
    _timer = Timer(splashDuration, finish);
    return false;
  }

  void finish() => state = true;
}
