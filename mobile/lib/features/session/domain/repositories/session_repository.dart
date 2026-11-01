import '../../../../core/result/result.dart';
import '../entities/device.dart';
import '../entities/token_pair.dart';

/// The device's session with the server. Registration is silent: the app
/// calls [ensureRegistered] at startup and never shows a sign-in screen.
abstract interface class SessionRepository {
  /// Registers this install if it has no session yet. Returns the new device,
  /// or null when it was already registered on an earlier launch.
  Future<Result<Device?>> ensureRegistered();

  /// Stores tokens the server issued after a role change (regulator mode on
  /// or off). The old tokens are already revoked server-side.
  Future<void> adoptTokens(TokenPair tokens);
}
