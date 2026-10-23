/// What the network layer needs from the session, without depending on the
/// session feature. Implemented by `features/session`.
abstract interface class AuthTokenSource {
  /// The current access token, or null if the device isn't registered yet.
  Future<String?> accessToken();

  /// Called after a 401. Refreshes (or re-registers) and returns a new access
  /// token, or null if the session can't be recovered. Concurrent callers
  /// share one refresh.
  Future<String?> recoverAfterUnauthorized();
}
