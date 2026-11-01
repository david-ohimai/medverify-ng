import 'dart:typed_data';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../core/result/result.dart';
import '../../scan/domain/entities/scan_result.dart';
import '../../session/data/models/session_models.dart';
import '../../session/domain/entities/device.dart';
import '../../session/domain/entities/token_pair.dart';
import '../domain/regulator_models.dart';

/// Regulator mode: switching role, and the regulator-only endpoints
/// (hotspots, the human review queue). The server checks the role on every
/// call; the app only decides what to show.
class RegulatorRepository {
  const RegulatorRepository(this._client);

  final ApiClient _client;

  Future<Result<Device>> me() =>
      _client.get(ApiEndpoints.me, parse: (data) => SessionModels.device(data! as Map<String, dynamic>));

  /// The PIN unlocks regulator mode; the server returns new tokens with the new role.
  Future<Result<({Device device, TokenPair tokens})>> elevate(String pin) =>
      _client.post(ApiEndpoints.elevate, body: {'pin': pin}, parse: SessionModels.session);

  Future<Result<({Device device, TokenPair tokens})>> demote() =>
      _client.post(ApiEndpoints.demote, parse: SessionModels.session);

  Future<Result<HotspotStats>> hotspotStats(String window) =>
      _client.get(ApiEndpoints.hotspotStats, query: {'window': window}, parse: HotspotStats.fromJson);

  Future<Result<List<Hotspot>>> hotspots() => _client.get(ApiEndpoints.hotspots, parse: Hotspot.listFromJson);

  Future<Result<ReviewStats>> reviewStats() => _client.get(ApiEndpoints.reviewStats, parse: ReviewStats.fromJson);

  Future<Result<List<ReviewItem>>> reviews(String status) =>
      _client.get(ApiEndpoints.reviews, query: {'status': status, 'limit': 50}, parse: ReviewItem.listFromJson);

  Future<Result<ReviewItem>> review(String id) => _client.get(ApiEndpoints.review(id), parse: ReviewItem.fromJson);

  Future<Result<Uint8List>> reviewImage(String id) => _client.bytes(ApiEndpoints.reviewImage(id));

  Future<Result<ReviewItem>> claim(String id) => _client.post(ApiEndpoints.reviewClaim(id), parse: ReviewItem.fromJson);

  Future<Result<ReviewItem>> decide(String id, {required ReviewDecision decision, Verdict? verdict, String? note}) =>
      _client.post(
        ApiEndpoints.reviewDecision(id),
        body: {
          'decision': decision.name,
          if (verdict != null) 'reviewedVerdict': verdict.code,
          if (note != null && note.trim().length >= 3) 'note': note.trim(),
        },
        parse: ReviewItem.fromJson,
      );
}
