import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/async_value_view.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../../../../shared/widgets/page_layout.dart';
import '../../../../shared/widgets/pill_tabs.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../../scan/domain/entities/scan_result.dart';
import '../../../scan/presentation/providers/scan_providers.dart';
import '../../../scan/presentation/widgets/verdict_style.dart';
import '../../../scan/presentation/widgets/verdict_widgets.dart';
import '../../domain/regulator_models.dart';
import '../providers/regulator_providers.dart';

/// One review: the pack photo beside the genuine pack, what the AI read
/// (with its confidence), every signal — then claim and decide.
class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({required this.reviewId, super.key});

  final String reviewId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailScaffold(
    title: 'Review',
    body: AsyncValueView(
      value: ref.watch(reviewProvider(reviewId)),
      loading: const VerdictSkeleton(),
      onRetry: () => ref.invalidate(reviewProvider(reviewId)),
      data: (item) => _ReviewBody(item: item),
    ),
  );
}

class _ReviewBody extends ConsumerWidget {
  const _ReviewBody({required this.item});

  final ReviewItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final myId = ref.watch(deviceRoleProvider.select((d) => d.value?.id));
    final mine = item.status == 'claimed' && item.claimedBy == myId;
    final style = VerdictStyle.of(item.verdict, context.palette);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.gutter),
      children: [
        _Photos(item: item),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(color: style.container, borderRadius: BorderRadius.circular(AppRadius.md)),
          child: Row(
            children: [
              Icon(style.icon, color: style.color),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'System says: ${style.label}${item.riskScore == null ? '' : ' (${item.riskScore}/100)'}',
                  style: context.text.titleSmall,
                ),
              ),
              Text('P${item.priority}', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
            ],
          ),
        ),
        if (item.label.isNotEmpty) ...[const SectionHeader(title: 'What the AI read'), _LabelTable(label: item.label)],
        const SectionHeader(title: 'Why the system flagged it'),
        SignalList(signals: item.signals),
        const SectionHeader(title: 'Decision'),
        if (item.decided)
          _Decided(item: item)
        else if (mine)
          _DecisionForm(reviewId: item.id)
        else
          _ClaimButton(reviewId: item.id, takenByOther: item.status == 'claimed'),
      ],
    );
  }
}

class _Photos extends ConsumerWidget {
  const _Photos({required this.item});

  final ReviewItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Widget frame(String label, AsyncValue<dynamic> value, String missing) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: switch (value) {
                AsyncData(value: final bytes?) => Image.memory(bytes, fit: BoxFit.cover, cacheWidth: 700),
                AsyncLoading() => const AppShimmer(child: ShimmerBox(height: double.infinity)),
                _ => ColoredBox(
                  color: context.colors.surfaceContainerHigh,
                  child: Center(
                    child: Text(missing, textAlign: TextAlign.center, style: context.text.bodySmall),
                  ),
                ),
              },
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(label, style: context.text.labelLarge),
        ],
      ),
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        frame('Scanned pack', ref.watch(reviewImageProvider(item.id)), 'Photo deleted\n(decided or > 7 days)'),
        const SizedBox(width: AppSpacing.sm),
        frame(
          'Genuine pack',
          item.registeredProduct == null
              ? const AsyncData<dynamic>(null)
              : ref.watch(referenceImageProvider(item.registeredProduct!)),
          'No reference photo',
        ),
      ],
    );
  }
}

class _LabelTable extends StatelessWidget {
  const _LabelTable({required this.label});

  final Map<String, (String?, double)> label;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      child: Column(
        children: [
          for (final MapEntry(key: field, value: (text, confidence)) in label.entries)
            if (text != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
                child: Row(
                  children: [
                    SizedBox(width: 110, child: Text(field.replaceAll('_', ' '), style: context.text.bodySmall)),
                    Expanded(
                      child: Text(text, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Text(
                      '${(confidence * 100).round()}%',
                      style: context.text.labelSmall?.copyWith(
                        color: confidence < 0.6 ? context.palette.suspicious : context.colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    ),
  );
}

class _ClaimButton extends ConsumerWidget {
  const _ClaimButton({required this.reviewId, required this.takenByOther});

  final String reviewId;
  final bool takenByOther;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (takenByOther)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            'Another reviewer is working on this (claims lapse after an hour).',
            style: context.text.bodySmall,
          ),
        ),
      FilledButton.icon(
        onPressed: () async {
          final error = await ref.read(reviewProvider(reviewId).notifier).claim();
          if (error != null && context.mounted) context.showMessage(error);
        },
        icon: const Icon(Iconsax.user_tick),
        label: const Text('Claim this review (1 hour)'),
      ),
    ],
  );
}

class _DecisionForm extends ConsumerWidget {
  const _DecisionForm({required this.reviewId});

  final String reviewId;

  static const _decisions = ReviewDecision.values;
  static const _verdicts = Verdict.values;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(decisionDraftProvider(reviewId));
    final controller = ref.read(decisionDraftProvider(reviewId).notifier);
    final palette = context.palette;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PillTabs(
          labels: const ['Agree', 'Disagree', 'Inconclusive'],
          selected: draft.decision == null ? -1 : _decisions.indexOf(draft.decision!),
          onSelected: (i) => controller.choose(_decisions[i]),
        ),
        if (draft.decision == ReviewDecision.disagree) ...[
          const SizedBox(height: AppSpacing.sm),
          Text('The right verdict is:', style: context.text.bodyMedium),
          const SizedBox(height: AppSpacing.xs),
          PillTabs(
            labels: [for (final v in _verdicts) VerdictStyle.of(v, palette).label],
            selected: draft.verdict == null ? -1 : _verdicts.indexOf(draft.verdict!),
            onSelected: (i) => controller.chooseVerdict(_verdicts[i]),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        TextFormField(
          onChanged: controller.setNote,
          maxLines: 3,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Note for the user (optional)',
            hintText: 'e.g. Logo and spelling differ from the genuine pack. Do not use; report to NAFDAC.',
          ),
        ),
        if (draft.error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(draft.error!, style: context.text.bodyMedium?.copyWith(color: palette.danger)),
          ),
        FilledButton.icon(
          onPressed: draft.canSubmit
              ? () async {
                  if (await controller.submit() && context.mounted) context.showMessage('Decision saved');
                }
              : null,
          icon: Icon(draft.submitting ? Iconsax.timer_1 : Iconsax.tick_circle),
          label: Text(draft.submitting ? 'Saving…' : 'Save decision'),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'The photo is deleted when you save. The user sees your decision and note.',
          style: context.text.bodySmall,
        ),
      ],
    );
  }
}

class _Decided extends StatelessWidget {
  const _Decided({required this.item});

  final ReviewItem item;

  @override
  Widget build(BuildContext context) {
    final text = switch (item.decision) {
      'agree' => 'Agreed with the system.',
      'disagree' => 'Changed the verdict to ${VerdictStyle.of(item.reviewedVerdict, context.palette).label}.',
      _ => 'Inconclusive — the user was told to see a pharmacist.',
    };
    return Card(
      child: ListTile(
        leading: Icon(Iconsax.tick_circle, color: context.palette.genuine),
        title: Text(text),
        subtitle: item.note == null ? null : Text('“${item.note}”'),
      ),
    );
  }
}
