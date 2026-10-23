import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) => const PageLayout(
    title: 'History',
    subtitle: 'Every pack you have checked',
    slivers: [
      SliverToBoxAdapter(
        child: EmptyState(
          icon: Iconsax.receipt_item,
          title: 'No scans yet',
          message: 'Scan a medicine pack and the result will be saved here, even offline.',
        ),
      ),
    ],
  );
}
