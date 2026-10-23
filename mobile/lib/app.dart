import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/constants/app_constants.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_controller.dart';
import 'features/session/presentation/providers/session_providers.dart';

class MedVerifyApp extends ConsumerWidget {
  const MedVerifyApp({super.key});

  // Built once; switching theme mode picks between them without rebuilding.
  static final _light = AppTheme.light();
  static final _dark = AppTheme.dark();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Start silent registration at launch and keep it alive. ref.listen (not
    // watch) so its progress never rebuilds the whole app.
    ref.listen(sessionControllerProvider, (_, _) {});

    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: _light,
      darkTheme: _dark,
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => MediaQuery.withClampedTextScaling(
        // Respect large text settings, but keep layouts from breaking.
        maxScaleFactor: 1.3,
        // Glass surfaces aren't Material; give text a Material ancestor.
        child: Material(type: MaterialType.transparency, child: child),
      ),
    );
  }
}
