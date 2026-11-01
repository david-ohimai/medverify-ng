import 'package:equatable/equatable.dart';

enum Verdict {
  likelyGenuine('likely_genuine'),
  suspicious('suspicious'),
  highRisk('high_risk'),
  unregistered('unregistered');

  const Verdict(this.code);
  final String code;

  static Verdict? fromCode(Object? code) => values.where((v) => v.code == code).firstOrNull;
}

enum Confidence {
  high,
  medium,
  low;

  static Confidence? fromCode(Object? code) => values.where((v) => v.name == code).firstOrNull;
}

enum ScanStatus {
  pending,
  processing,
  done,
  failed;

  static ScanStatus fromCode(Object? code) => values.where((v) => v.name == code).firstOrNull ?? ScanStatus.pending;
  bool get finished => this == done || this == failed;
}

enum SignalSeverity {
  good,
  info,
  warning,
  danger;

  static SignalSeverity fromCode(Object? code) =>
      values.where((v) => v.name == code).firstOrNull ?? SignalSeverity.info;
}

/// One reason behind a verdict ("Why we think so").
class ScanSignal extends Equatable {
  const ScanSignal({
    required this.code,
    required this.label,
    required this.weight,
    required this.severity,
    this.detail,
  });

  final String code;
  final String label;
  final int weight;
  final SignalSeverity severity;
  final String? detail;

  @override
  List<Object?> get props => [code, label, weight, severity, detail];
}

class ScanProduct extends Equatable {
  const ScanProduct({
    required this.nafdacNo,
    required this.brandName,
    required this.genericName,
    required this.isDemo,
    this.strength,
    this.manufacturer,
  });

  final String nafdacNo;
  final String brandName;
  final String genericName;
  final String? strength;
  final String? manufacturer;

  /// Fictional demo data, always labelled as such in the UI.
  final bool isDemo;

  @override
  List<Object?> get props => [nafdacNo, brandName, genericName, strength, manufacturer, isDemo];
}

/// A pharmacist's review of the scan, when it was queued for one.
class ScanReview extends Equatable {
  const ScanReview({required this.status, required this.message, this.decision, this.note});

  final String status;
  final String? decision;
  final String? note;
  final String message;

  bool get decided => status == 'decided';

  @override
  List<Object?> get props => [status, decision, note, message];
}

/// A finished (or in-progress) check, typed in or photographed.
class ScanResult extends Equatable {
  const ScanResult({
    required this.id,
    required this.isPhoto,
    required this.status,
    required this.headline,
    required this.advice,
    required this.signals,
    required this.checkedAt,
    required this.disclaimer,
    this.verdict,
    this.riskScore,
    this.confidence,
    this.failureMessage,
    this.product,
    this.review,
    this.nafdacNo,
    this.productName,
    this.batchNo,
    this.expiry,
    this.areaName,
  });

  final String id;
  final bool isPhoto;
  final ScanStatus status;
  final Verdict? verdict;
  final int? riskScore;
  final Confidence? confidence;
  final String headline;
  final String advice;
  final List<ScanSignal> signals;
  final String? failureMessage;
  final ScanProduct? product;
  final ScanReview? review;
  final String? nafdacNo;
  final String? productName;
  final String? batchNo;
  final String? expiry;
  final String? areaName;
  final DateTime checkedAt;
  final String disclaimer;

  /// The name to show: the registered product, else what was read or typed.
  String get displayName => product?.brandName ?? productName ?? nafdacNo ?? 'Unknown product';

  @override
  List<Object?> get props => [id, status, verdict, riskScore, confidence, headline, signals, review, checkedAt];
}
