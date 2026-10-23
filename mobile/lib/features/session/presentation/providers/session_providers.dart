import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failure.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/result/result.dart';
import '../../../../core/storage/storage_providers.dart';
import '../../data/datasources/session_local_data_source.dart';
import '../../data/datasources/session_remote_data_source.dart';
import '../../data/device_info.dart';
import '../../data/repositories/session_repository_impl.dart';

final sessionRepositoryProvider = Provider<SessionRepositoryImpl>((ref) {
  return SessionRepositoryImpl(
    remote: SessionRemoteDataSource(ref.watch(publicApiClientProvider)),
    local: SessionLocalDataSource(ref.watch(secureStoreProvider)),
    deviceInfo: DeviceInfo.load,
    language: () => ref.read(preferencesStoreProvider).language,
  );
});

/// Silent registration, started at launch and never blocking the UI.
/// AsyncError holds a [Failure] (e.g. offline); [SessionController.retry]
/// tries again. Screens that need the network watch this to show a banner.
final sessionControllerProvider = AsyncNotifierProvider<SessionController, void>(SessionController.new);

class SessionController extends AsyncNotifier<void> {
  @override
  Future<void> build() => _register();

  Future<void> retry() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_register);
  }

  Future<void> _register() async {
    final result = await ref.read(sessionRepositoryProvider).ensureRegistered();
    if (result case Err(:final failure)) throw failure;
  }
}
