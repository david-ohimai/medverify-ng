import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../providers/scan_providers.dart';

/// Typed-in check: NAFDAC number (required), name, batch and expiry. Fields
/// report every change to [ManualCheckController]; no local state here.
class ManualCheckScreen extends ConsumerWidget {
  const ManualCheckScreen({super.key});

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    FocusScope.of(context).unfocus();
    final scanId = await ref.read(manualCheckControllerProvider.notifier).submit();
    if (scanId != null && context.mounted) context.pushReplacement(AppRoutes.scanResult(scanId));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(manualCheckControllerProvider.notifier);
    final errors = ref.watch(manualCheckControllerProvider.select((s) => s.fieldErrors));

    return DetailScaffold(
      title: 'Type the details',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.gutter),
        children: [
          Text(
            'Copy them exactly as printed on the pack. Only the NAFDAC number is required, the more you add, the '
            'more we can check.',
            style: context.text.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          TextFormField(
            onChanged: controller.setNafdacNo,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'NAFDAC Reg. No.',
              hintText: 'e.g. A4-1234',
              prefixIcon: const Icon(Iconsax.shield_search),
              errorText: errors['nafdacNo'],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            onChanged: controller.setProductName,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Product name (optional)',
              hintText: 'As printed, e.g. Coartem',
              prefixIcon: Icon(Iconsax.health),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            onChanged: controller.setBatchNo,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Batch / Lot no. (optional)',
              prefixIcon: const Icon(Iconsax.barcode),
              errorText: errors['batchNo'],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            onChanged: controller.setExpiry,
            keyboardType: TextInputType.datetime,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9/\-.]'))],
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(context, ref),
            decoration: InputDecoration(
              labelText: 'Expiry (optional)',
              hintText: 'MM/YYYY, e.g. 08/2027',
              prefixIcon: const Icon(Iconsax.calendar_1),
              errorText: errors['expiry'],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const _FormError(),
        ],
      ),
      bottom: Padding(
        padding: const EdgeInsets.all(AppSpacing.gutter),
        child: _SubmitButton(onPressed: () => _submit(context, ref)),
      ),
    );
  }
}

class _FormError extends ConsumerWidget {
  const _FormError();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final error = ref.watch(manualCheckControllerProvider.select((s) => s.fieldErrors.isEmpty ? s.error : null));
    if (error == null) return const SizedBox.shrink();
    return Text(error, style: context.text.bodyMedium?.copyWith(color: context.palette.danger));
  }
}

class _SubmitButton extends ConsumerWidget {
  const _SubmitButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (canSubmit, submitting) = ref.watch(manualCheckControllerProvider.select((s) => (s.canSubmit, s.submitting)));
    return FilledButton.icon(
      onPressed: canSubmit ? onPressed : null,
      icon: Icon(submitting ? Iconsax.timer_1 : Iconsax.shield_search),
      label: Text(submitting ? 'Checking…' : 'Check this medicine'),
    );
  }
}
