import 'package:equatable/equatable.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../core/result/result.dart';

/// A warning near the user: a cluster of suspicious scans (a hotspot).
class NearbyAlert extends Equatable {
  const NearbyAlert({
    required this.id,
    required this.severity,
    required this.distanceKm,
    required this.recallInvolved,
    required this.includesSimulatedData,
    required this.lastSeen,
    this.areaName,
    this.productName,
    this.nafdacNo,
    this.batchNo,
    this.title,
    this.isDemoProduct = false,
  });

  final String id;
  final String severity;
  final double distanceKm;
  final String? areaName;
  final String? productName;
  final String? nafdacNo;
  final String? batchNo;
  final bool recallInvolved;
  final String? title;
  final DateTime lastSeen;
  final bool includesSimulatedData;
  final bool isDemoProduct;

  static NearbyAlert fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>?;
    return NearbyAlert(
      id: json['id'] as String,
      severity: json['severity'] as String,
      distanceKm: (json['distanceKm'] as num).toDouble(),
      areaName: json['areaName'] as String?,
      productName: product?['brandName'] as String?,
      nafdacNo: json['nafdacNo'] as String?,
      batchNo: json['batchNo'] as String?,
      recallInvolved: json['recallInvolved'] as bool? ?? false,
      title: json['title'] as String?,
      lastSeen: DateTime.parse(json['lastSeen'] as String).toLocal(),
      includesSimulatedData: json['includesSimulatedData'] as bool? ?? false,
      isDemoProduct: product?['source'] == 'demo',
    );
  }

  @override
  List<Object?> get props => [id, severity, distanceKm, title, lastSeen];
}

class AlertsRepository {
  const AlertsRepository(this._client);

  final ApiClient _client;

  Future<Result<List<NearbyAlert>>> nearby({
    required double latitude,
    required double longitude,
    double radiusKm = 50,
  }) => _client.get(
    ApiEndpoints.alertsNearby,
    query: {'lat': latitude, 'lng': longitude, 'radiusKm': radiusKm},
    parse: (data) => [for (final item in data! as List) NearbyAlert.fromJson(item as Map<String, dynamic>)],
  );
}
