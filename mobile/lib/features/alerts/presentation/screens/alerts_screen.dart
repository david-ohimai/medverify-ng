import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/page_layout.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) => const PageLayout(
    title: 'Alerts',
    subtitle: 'Recalls and fake-drug reports near you',
    slivers: [
      SliverToBoxAdapter(
        child: EmptyState(
          icon: Iconsax.notification,
          title: 'No alerts near you',
          message: 'When fakes or recalls are reported in your area, they will show up here.',
        ),
      ),
    ],
  );
}
