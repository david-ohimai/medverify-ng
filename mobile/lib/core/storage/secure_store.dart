import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Credentials only: install id and tokens. Backed by the Android Keystore
/// and the iOS Keychain. Keychain items are bound to this device (not synced
/// to iCloud) and readable after the first unlock, so background refreshes work.
class SecureStore {
  SecureStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
          );

  final FlutterSecureStorage _storage;

  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);
}
