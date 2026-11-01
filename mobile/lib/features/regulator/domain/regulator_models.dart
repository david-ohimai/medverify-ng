import 'package:equatable/equatable.dart';

import '../../scan/data/scan_models.dart';
import '../../scan/domain/entities/scan_result.dart';

typedef Json = Map<String, dynamic>;

/// Headline numbers for the regulator dashboard (GET /hotspots/stats).
class HotspotStats extends Equatable {
  const HotspotStats({
    required this.scans,
    required this.flagged,
    required this.highRisk,
    required this.unregistered,
    required this.activeHotspots,
    required this.highSeverityHotspots,
    required this.includesSimulatedData,
  });

  final int scans;
  final int flagged;
  final int highRisk;
  final int unregistered;
  final int activeHotspots;
  final int highSeverityHotspots;
  final bool includesSimulatedData;

  static HotspotStats fromJson(Object? data) {
    final json = data! as Json;
    int n(String key) => (json[key] as num? ?? 0).toInt();
    return HotspotStats(
      scans: n('scans'),
      flagged: n('flagged'),
      highRisk: n('highRisk'),
      unregistered: n('unregistered'),
      activeHotspots: n('activeHotspots'),
      highSeverityHotspots: n('highSeverityHotspots'),
      includesSimulatedData: json['includesSimulatedData'] as bool? ?? false,
    );
  }

  @override
  List<Object?> get props => [scans, flagged, highRisk, unregistered, activeHotspots, highSeverityHotspots];
}

/// A cluster of suspicious scans, with its latest AI-written alert.
class Hotspot extends Equatable {
  const Hotspot({
    required this.id,
    required this.severity,
    required this.scanCount,
    required this.highRiskCount,
    required this.recallInvolved,
    required this.radiusM,
    required this.lastSeen,
    required this.includesSimulatedData,
    this.areaName,
    this.productName,
    this.nafdacNo,
    this.batchNo,
    this.alertTitle,
    this.alertBody,
    this.recommendedAction,
  });

  final String id;
  final String severity;
  final int scanCount;
  final int highRiskCount;
  final bool recallInvolved;
  final int radiusM;
  final DateTime lastSeen;
  final bool includesSimulatedData;
  final String? areaName;
  final String? productName;
  final String? nafdacNo;
  final String? batchNo;
  final String? alertTitle;
  final String? alertBody;
  final String? recommendedAction;

  static List<Hotspot> listFromJson(Object? data) => [for (final item in data! as List) fromJson(item as Json)];

  static Hotspot fromJson(Json json) {
    final product = json['product'] as Json?;
    final alert = json['latestAlert'] as Json?;
    return Hotspot(
      id: json['id'] as String,
      severity: json['severity'] as String,
      scanCount: (json['scanCount'] as num).toInt(),
      highRiskCount: (json['highRiskCount'] as num).toInt(),
      recallInvolved: json['recallInvolved'] as bool? ?? false,
      radiusM: (json['radiusM'] as num).toInt(),
      lastSeen: DateTime.parse(json['lastSeen'] as String).toLocal(),
      includesSimulatedData: json['includesSimulatedData'] as bool? ?? false,
      areaName: json['areaName'] as String?,
      productName: product?['brandName'] as String?,
      nafdacNo: json['nafdacNo'] as String?,
      batchNo: json['batchNo'] as String?,
      alertTitle: alert?['title'] as String?,
      alertBody: alert?['body'] as String?,
      recommendedAction: alert?['recommendedAction'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, severity, scanCount, lastSeen, alertTitle];
}

/// Queue health and reviewer agreement (GET /reviews/stats).
class ReviewStats extends Equatable {
  const ReviewStats({required this.open, required this.urgent, required this.overdue, this.agreementRate});

  final int open;
  final int urgent;
  final int overdue;
  final int? agreementRate;

  static ReviewStats fromJson(Object? data) {
    final json = data! as Json;
    final open = json['open'] as Json;
    final decided = json['decided'] as Json;
    return ReviewStats(
      open: (open['total'] as num).toInt(),
      urgent: (open['urgent'] as num).toInt(),
      overdue: (open['overdue'] as num).toInt(),
      agreementRate: (decided['agreementRate'] as num?)?.toInt(),
    );
  }

  @override
  List<Object?> get props => [open, urgent, overdue, agreementRate];
}

enum ReviewDecision { agree, disagree, inconclusive }

/// One scan in the human review queue.
class ReviewItem extends Equatable {
  const ReviewItem({
    required this.id,
    required this.status,
    required this.priority,
    required this.reasons,
    required this.slaDeadline,
    required this.overdue,
    required this.escalationLevel,
    this.claimedBy,
    this.verdict,
    this.riskScore,
    this.productName,
    this.nafdacNo,
    this.batchNo,
    this.areaName,
    this.decision,
    this.reviewedVerdict,
    this.note,
    this.signals = const [],
    this.label = const {},
    this.referenceImageId,
    this.registeredProduct,
  });

  final String id;
  final String status;
  final int priority;
  final List<String> reasons;
  final DateTime slaDeadline;
  final bool overdue;
  final int escalationLevel;
  final String? claimedBy;
  final Verdict? verdict;
  final int? riskScore;
  final String? productName;
  final String? nafdacNo;
  final String? batchNo;
  final String? areaName;
  final String? decision;
  final Verdict? reviewedVerdict;
  final String? note;

  // Detail only.
  final List<ScanSignal> signals;

  /// What the AI read: field → (value, confidence).
  final Map<String, (String?, double)> label;
  final String? referenceImageId;

  /// The registered product's NAFDAC number, for its reference photo.
  final String? registeredProduct;

  bool get decided => status == 'decided';

  static List<ReviewItem> listFromJson(Object? data) => [for (final item in data! as List) fromJson(item as Json)];

  static ReviewItem fromJson(Object? data) {
    final json = data! as Json;
    final scan = (json['scan'] as Json?) ?? const {};
    final product = scan['product'] as Json?;
    final images = (product?['referenceImages'] as List? ?? const []).cast<Json>();
    final extractedLabel = ((scan['extracted'] as Json?)?['label'] as Json?) ?? const {};
    final deadline = DateTime.parse(json['slaDeadline'] as String).toLocal();
    return ReviewItem(
      id: json['id'] as String,
      status: json['status'] as String,
      priority: (json['priority'] as num).toInt(),
      reasons: (json['reasons'] as List? ?? const []).cast<String>(),
      slaDeadline: deadline,
      overdue: json['overdue'] as bool? ?? (json['status'] != 'decided' && deadline.isBefore(DateTime.now())),
      escalationLevel: (json['escalationLevel'] as num? ?? 0).toInt(),
      claimedBy: json['claimedBy'] as String?,
      verdict: Verdict.fromCode(scan['verdict']),
      riskScore: (scan['riskScore'] as num?)?.toInt(),
      productName: scan['productName'] as String?,
      nafdacNo: scan['nafdacNo'] as String?,
      batchNo: scan['batchNo'] as String?,
      areaName: scan['areaName'] as String?,
      decision: json['decision'] as String?,
      reviewedVerdict: Verdict.fromCode(json['reviewedVerdict']),
      note: json['reviewerNote'] as String?,
      signals: [for (final s in (scan['signals'] as List? ?? const [])) ScanModels.signal(s)],
      label: {
        for (final entry in extractedLabel.entries)
          if (entry.value is Map)
            entry.key: (
              (entry.value as Json)['value'] as String?,
              ((entry.value as Json)['confidence'] as num? ?? 0).toDouble(),
            ),
      },
      referenceImageId:
          images.where((i) => i['side'] == 'front').firstOrNull?['id'] as String? ??
          images.firstOrNull?['id'] as String?,
      registeredProduct: product?['nafdacNo'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, status, priority, decision, claimedBy, slaDeadline, escalationLevel];
}
