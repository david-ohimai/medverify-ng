import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../providers/regulator_providers.dart';

class PinForm extends Equatable {
  const PinForm({this.pin = '', this.submitting = false, this.error});

  final String pin;
  final bool submitting;
  final String? error;

  bool get canSubmit => !submitting && RegExp(r'^\d{6,12}$').hasMatch(pin);

  @override
  List<Object?> get props => [pin, submitting, error];
}

final pinFormProvider = NotifierProvider.autoDispose<PinFormController, PinForm>(PinFormController.new);

class PinFormController extends Notifier<PinForm> {
  @override
  PinForm build() => const PinForm();

  void setPin(String pin) => state = PinForm(pin: pin);

  Future<bool> submit() async {
    if (!state.canSubmit) return false;
    final pin = state.pin;
    state = PinForm(pin: pin, submitting: true);
    final error = await ref.read(deviceRoleProvider.notifier).unlock(pin);
    if (!ref.mounted) return error == null;
    state = PinForm(pin: error == null ? '' : pin, error: error);
    return error == null;
  }
}

/// Settings → Regulator: unlock with the PIN, or (when on) open the
/// dashboard and leave regulator mode.
class RegulatorSection extends ConsumerWidget {
  const RegulatorSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final device = ref.watch(deviceRoleProvider);
    return switch (device) {
      AsyncData(:final value) when value.isRegulator => const _RegulatorOn(),
      AsyncData() => const _Unlock(),
      _ => const AppShimmer(child: ShimmerBox(height: 220, radius: AppRadius.lg)),
    };
  }
}

class _Unlock extends ConsumerWidget {
  const _Unlock();

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    FocusScope.of(context).unfocus();
    if (await ref.read(pinFormProvider.notifier).submit() && context.mounted) {
      context.showMessage('Regulator mode is on');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final form = ref.watch(pinFormProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Regulator mode'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'For NAFDAC officers and pharmacists. Unlocks the hotspot dashboard, the review queue for risky '
                  'scans, and "Ask the data".',
                  style: context.text.bodyMedium,
                ),
                const SizedBox(height: AppSpacing.md),
                TextField(
                  onChanged: ref.read(pinFormProvider.notifier).setPin,
                  onSubmitted: (_) => _submit(context, ref),
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
                  autofillHints: const [],
                  enableSuggestions: false,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: 'Regulator PIN',
                    prefixIcon: const Icon(Iconsax.lock),
                    errorText: form.error,
                    errorMaxLines: 3,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                FilledButton.icon(
                  onPressed: form.canSubmit ? () => _submit(context, ref) : null,
                  icon: Icon(form.submitting ? Iconsax.timer_1 : Iconsax.unlock),
                  label: Text(form.submitting ? 'Checking…' : 'Unlock regulator mode'),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Wrong PINs are limited (5 per 15 minutes on this phone) and logged.',
                  style: context.text.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _RegulatorOn extends ConsumerWidget {
  const _RegulatorOn();

  Future<void> _leave(BuildContext context, WidgetRef ref) async {
    final error = await ref.read(deviceRoleProvider.notifier).leave();
    if (context.mounted) context.showMessage(error ?? 'Back to public mode');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Regulator mode'),
        Material(
          color: palette.genuineContainer,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                Icon(Iconsax.shield_tick, color: palette.genuine),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text('Regulator mode is on', style: context.text.titleSmall)),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        FilledButton.icon(
          onPressed: () => context.push(AppRoutes.regulator),
          icon: const Icon(Iconsax.chart_square),
          label: const Text('Open the dashboard'),
        ),
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton.icon(
          onPressed: () => context.push(AppRoutes.reviewQueue),
          icon: const Icon(Iconsax.task_square),
          label: const Text('Review queue'),
        ),
        const SizedBox(height: AppSpacing.sm),
        TextButton.icon(
          onPressed: () => _leave(context, ref),
          icon: const Icon(Iconsax.logout),
          label: const Text('Leave regulator mode'),
        ),
      ],
    );
  }
}
