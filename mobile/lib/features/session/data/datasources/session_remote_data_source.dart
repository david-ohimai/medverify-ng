import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/constants/app_language.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/result/result.dart';
import '../../domain/entities/device.dart';
import '../../domain/entities/token_pair.dart';
import '../models/session_models.dart';

/// Calls the two session endpoints. Uses the public client: these requests
/// must work exactly when the device has no valid token.
class SessionRemoteDataSource {
  const SessionRemoteDataSource(this._client);

  final ApiClient _client;

  Future<Result<({Device device, TokenPair tokens})>> register({
    required String installId,
    required String platform,
    required String appVersion,
    required AppLanguage language,
  }) => _client.post(
    ApiEndpoints.registerDevice,
    body: {'installId': installId, 'platform': platform, 'appVersion': appVersion, 'language': language.code},
    parse: SessionModels.session,
  );

  Future<Result<TokenPair>> refresh(String refreshToken) =>
      _client.post(ApiEndpoints.refreshTokens, body: {'refreshToken': refreshToken}, parse: SessionModels.refreshed);
}
