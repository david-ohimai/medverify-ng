/// What the network layer needs from the session, without depending on the
/// session feature. Implemented by `features/session`.
abstract interface class AuthTokenSource {
  /// The current access token, or null if the device isn't registered yet.
  /// May throw if secure storage can't be read.
  Future<String?> accessToken();

  /// Called after a 401. Refreshes (or re-registers) and returns a new access
  /// token, or null if the session can't be recovered right now.
  ///
  /// [failedToken] is the token the rejected request carried. If the session
  /// has already moved on (another request refreshed, or registration just
  /// finished), the current token is returned without another refresh.
  /// Concurrent callers share one recovery.
  Future<String?> recoverAfterUnauthorized({required String? failedToken});
}

/// Secure storage failed while reading the token for a request.
class TokenStorageException implements Exception {
  const TokenStorageException(this.cause);

  final Object cause;

  @override
  String toString() => 'TokenStorageException($cause)';
}
