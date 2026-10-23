import 'package:uuid/uuid.dart';

import '../../../../core/constants/storage_keys.dart';
import '../../../../core/storage/secure_store.dart';
import '../../domain/entities/token_pair.dart';

/// Install id and tokens in secure storage. The access token is also kept in
/// memory so authenticated requests don't hit the Keystore every time.
class SessionLocalDataSource {
  SessionLocalDataSource(this._store);

  final SecureStore _store;
  String? _cachedAccessToken;

  /// Shared by every caller, so concurrent first calls can't each generate
  /// and save a different id.
  Future<String>? _installId;

  /// A random UUID v4 created on first launch and kept for the life of the
  /// install. It is the device's credential, so it never leaves secure storage
  /// except in the registration request.
  Future<String> installId() => _installId ??= _loadOrCreateInstallId().catchError((Object error) {
    // Let the next call try again instead of caching the failure forever.
    _installId = null;
    throw error;
  });

  Future<String> _loadOrCreateInstallId() async {
    final existing = await _store.read(StorageKeys.installId);
    if (existing != null) return existing;
    final created = const Uuid().v4();
    await _store.write(StorageKeys.installId, created);
    return created;
  }

  Future<String?> accessToken() async => _cachedAccessToken ??= await _store.read(StorageKeys.accessToken);

  Future<String?> refreshToken() => _store.read(StorageKeys.refreshToken);

  Future<void> saveTokens(TokenPair tokens) async {
    _cachedAccessToken = tokens.accessToken;
    await Future.wait([
      _store.write(StorageKeys.accessToken, tokens.accessToken),
      _store.write(StorageKeys.refreshToken, tokens.refreshToken),
    ]);
  }

  Future<void> clearTokens() async {
    _cachedAccessToken = null;
    await Future.wait([_store.delete(StorageKeys.accessToken), _store.delete(StorageKeys.refreshToken)]);
  }
}
