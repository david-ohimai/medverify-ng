import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Number of unread alerts near the user, shown as the tab bar badge.
/// Day 1 has no alerts endpoint yet, so it starts at 0; the alerts feature
/// (GET /alerts/nearby) will set it.
final alertBadgeCountProvider = NotifierProvider<AlertBadgeCount, int>(AlertBadgeCount.new);

class AlertBadgeCount extends Notifier<int> {
  @override
  int build() => 0;

  void set(int count) => state = count < 0 ? 0 : count;
}
