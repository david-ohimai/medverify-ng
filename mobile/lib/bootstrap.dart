import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/config/env.dart';
import 'core/constants/storage_keys.dart';
import 'core/network/network_providers.dart';
import 'core/storage/storage_providers.dart';
import 'features/session/presentation/providers/session_providers.dart';

/// The composition root: everything that must exist before the first frame,
/// and the wiring between core and features.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  Env.validate();

  final (prefs, _) = await (
    SharedPreferencesWithCache.create(
      cacheOptions: const SharedPreferencesWithCacheOptions(allowList: StorageKeys.preferenceKeys),
    ),
    // Loads the glass shaders now, so the first frame has no white flash.
    LiquidGlassWidgets.initialize(),
  ).wait;

  runApp(
    LiquidGlassWidgets.wrap(
      // Glass follows the app's light/dark choice, not just the OS setting.
      brightnessResolver: Theme.maybeBrightnessOf,
      child: ProviderScope(
        // Riverpod 3 retries failing providers by default. Session and network
        // failures are handled explicitly (retry buttons), so turn that off.
        retry: (_, _) => null,
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          authTokenSourceProvider.overrideWith((ref) => ref.watch(sessionRepositoryProvider)),
        ],
        child: const MedVerifyApp(),
      ),
    ),
  );
}
