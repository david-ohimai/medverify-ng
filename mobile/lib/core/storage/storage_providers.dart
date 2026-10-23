import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'preferences_store.dart';
import 'secure_store.dart';

/// Loaded in bootstrap.dart before the first frame and injected with an
/// override, so preferences are available synchronously everywhere.
final sharedPreferencesProvider = Provider<SharedPreferencesWithCache>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden in bootstrap'),
);

final preferencesStoreProvider = Provider<PreferencesStore>(
  (ref) => PreferencesStore(ref.watch(sharedPreferencesProvider)),
);

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());
