import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/location/location_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/sse.dart';
import '../../../core/result/result.dart';
import '../domain/entities/scan_result.dart';
import 'scan_models.dart';

/// Typed-in check fields, as the user entered them (the server normalises).
class ManualCheckInput {
  const ManualCheckInput({required this.nafdacNo, this.productName, this.batchNo, this.expiry});

  final String nafdacNo;
  final String? productName;
  final String? batchNo;

  /// "YYYY-MM".
  final String? expiry;
}

/// Every scan endpoint behind one class. Returns [Result]s and streams of
/// [SseEvent]; no Dio, JSON or status codes leak out.
class ScanRepository {
  const ScanRepository(this._client);

  final ApiClient _client;

  /// Uploads a pack photo; the server answers 202 at once with the scan id.
  Future<Result<String>> submitPhoto({required String path, ApproxLocation? location}) async {
    final form = FormData.fromMap({
      'image': await MultipartFile.fromFile(path, filename: 'pack.jpg'),
      if (location != null) 'lat': location.latitude.toString(),
      if (location != null) 'lng': location.longitude.toString(),
    });
    return _client.upload(ApiEndpoints.scans, form: form, parse: ScanModels.submittedScanId);
  }

  /// Live pipeline progress: `step` events, then `verdict` or `error`.
  Stream<SseEvent> progress(String scanId) => _client.stream(ApiEndpoints.scanEvents(scanId));

  Future<Result<ScanResult>> get(String scanId) => _client.get(ApiEndpoints.scan(scanId), parse: ScanModels.result);

  Future<Result<List<ScanResult>>> history({int page = 1, int limit = 20}) =>
      _client.get(ApiEndpoints.scans, query: {'page': page, 'limit': limit}, parse: ScanModels.results);

  Future<Result<ScanResult>> checkManually(ManualCheckInput input, {ApproxLocation? location}) => _client.post(
    ApiEndpoints.verifyManual,
    body: {
      'nafdacNo': input.nafdacNo,
      if (input.productName != null) 'productName': input.productName,
      if (input.batchNo != null) 'batchNo': input.batchNo,
      if (input.expiry != null) 'expiry': input.expiry,
      if (location != null) 'lat': location.latitude,
      if (location != null) 'lng': location.longitude,
    },
    parse: ScanModels.result,
  );

  Future<Result<List<String>>> referenceImageIds(String nafdacNo) =>
      _client.get(ApiEndpoints.product(nafdacNo), parse: ScanModels.referenceImageIds);

  Future<Result<Uint8List>> referenceImage(String nafdacNo, String imageId) =>
      _client.bytes(ApiEndpoints.referenceImage(nafdacNo, imageId));
}
