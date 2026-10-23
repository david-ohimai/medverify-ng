import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';

/// Placeholder until the camera scanner lands (mvp.md day 3).
class ScanScreen extends StatelessWidget {
  const ScanScreen({super.key});

  @override
  Widget build(BuildContext context) => const PageLayout(
    title: 'Scan',
    subtitle: 'Check a medicine pack in seconds',
    slivers: [
      SliverToBoxAdapter(
        child: EmptyState(
          icon: Iconsax.scan_barcode,
          title: 'Scanner is on its way',
          message: 'Point your camera at a pack and MedVerify will read the NAFDAC number, batch and expiry.',
        ),
      ),
    ],
  );
}
