import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../shared/widgets/ai_insight_card.dart';

/// Injectable clock, so time-based logic is testable.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// "Good morning" / "Good afternoon" / "Good evening" — computed here, not in the widget.
final greetingProvider = Provider<String>((ref) {
  final hour = ref.watch(clockProvider)().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
});

/// Lines for the AI Insight card. Until scans exist these are first-run tips;
/// GET /insights/home replaces them once the scan pipeline is live.
final homeInsightsProvider = Provider<List<InsightLine>>(
  (ref) => const [
    InsightLine(
      icon: Iconsax.scan_barcode,
      text: 'Scan any medicine pack to check its NAFDAC number, batch and expiry.',
      tone: InsightTone.info,
    ),
    InsightLine(
      icon: Iconsax.danger,
      text: 'Antimalarials and antibiotics are the most commonly faked medicines in Nigeria.',
      tone: InsightTone.warning,
    ),
    InsightLine(icon: Iconsax.people, text: 'Every suspicious scan helps warn people near you.'),
  ],
);
