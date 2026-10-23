import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../providers/settings_providers.dart';

class AboutSection extends ConsumerWidget {
  const AboutSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const SectionHeader(title: AppConstants.appName),
      Card(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Iconsax.info_circle),
              title: const Text('Version'),
              trailing: SizedBox(
                width: 96,
                child: AsyncValueView(
                  value: ref.watch(appVersionProvider),
                  loading: const AppShimmer(child: ShimmerLine(height: 14)),
                  data: (version) => Text(version, textAlign: TextAlign.end, style: context.text.bodyMedium),
                ),
              ),
            ),
            const Divider(indent: AppSpacing.md, endIndent: AppSpacing.md),
            ListTile(
              leading: const Icon(Iconsax.document_text),
              title: const Text('Open-source licences'),
              trailing: const Icon(Iconsax.arrow_right_3, size: 18),
              onTap: () => showLicensePage(context: context, applicationName: AppConstants.appName),
            ),
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.md),
      Text(
        'MedVerify gives a careful second opinion. It never says a medicine is 100% safe. '
        'If a pack looks suspicious, do not take it — show it to a pharmacist or report it to NAFDAC.',
        style: context.text.bodySmall,
      ),
    ],
  );
}
