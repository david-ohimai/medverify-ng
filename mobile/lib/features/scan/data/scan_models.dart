import '../domain/entities/scan_result.dart';

typedef Json = Map<String, dynamic>;

/// JSON → entities for the scan endpoints. Kept in one place so a change in
/// the API is a change here only.
abstract final class ScanModels {
  static ScanResult result(Object? data) {
    final json = data! as Json;
    final input = (json['input'] as Json?) ?? const {};
    final failure = json['failure'] as Json?;
    return ScanResult(
      id: json['scanId'] as String,
      isPhoto: json['kind'] == 'photo',
      status: ScanStatus.fromCode(json['status']),
      verdict: Verdict.fromCode(json['verdict']),
      riskScore: (json['riskScore'] as num?)?.toInt(),
      confidence: Confidence.fromCode(json['confidence']),
      headline: json['headline'] as String? ?? '',
      advice: json['advice'] as String? ?? '',
      signals: [for (final s in (json['signals'] as List? ?? const [])) signal(s)],
      failureMessage: failure?['message'] as String?,
      product: json['product'] == null ? null : product(json['product']),
      review: json['review'] == null ? null : review(json['review']),
      nafdacNo: input['nafdacNo'] as String?,
      productName: input['productName'] as String?,
      batchNo: input['batchNo'] as String?,
      expiry: input['expiry'] as String?,
      areaName: json['areaName'] as String?,
      checkedAt: DateTime.parse(json['checkedAt'] as String).toLocal(),
      disclaimer: json['disclaimer'] as String? ?? '',
    );
  }

  static List<ScanResult> results(Object? data) => [for (final item in data! as List) result(item)];

  static ScanSignal signal(Object? data) {
    final json = data! as Json;
    return ScanSignal(
      code: json['code'] as String,
      label: json['label'] as String,
      weight: (json['weight'] as num).toInt(),
      severity: SignalSeverity.fromCode(json['severity']),
      detail: json['detail'] as String?,
    );
  }

  static ScanProduct product(Object? data) {
    final json = data! as Json;
    return ScanProduct(
      nafdacNo: json['nafdacNo'] as String,
      brandName: json['brandName'] as String,
      genericName: json['genericName'] as String,
      strength: json['strength'] as String?,
      manufacturer: json['manufacturer'] as String?,
      isDemo: json['source'] == 'demo',
    );
  }

  static ScanReview review(Object? data) {
    final json = data! as Json;
    return ScanReview(
      status: json['status'] as String,
      decision: json['decision'] as String?,
      note: json['note'] as String?,
      message: json['message'] as String? ?? '',
    );
  }

  /// POST /scans → the new scan's id.
  static String submittedScanId(Object? data) => (data! as Json)['scanId'] as String;

  /// GET /products/:no → ids of its genuine-pack reference photos, front first.
  static List<String> referenceImageIds(Object? data) {
    final images = ((data! as Json)['referenceImages'] as List? ?? const []).cast<Json>();
    images.sort((a, b) => (a['side'] == 'front' ? 0 : 1).compareTo(b['side'] == 'front' ? 0 : 1));
    return [for (final image in images) image['id'] as String];
  }
}
