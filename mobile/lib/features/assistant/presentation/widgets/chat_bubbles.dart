import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/ai_insight_card.dart';
import '../../../../shared/widgets/shimmer/app_shimmer.dart';
import '../../../../shared/widgets/simple_markdown.dart';
import '../../domain/chat_message.dart';

class UserBubble extends StatelessWidget {
  const UserBubble({required this.message, super.key});

  final UserMessage message;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerRight,
    child: Container(
      margin: const EdgeInsets.only(left: 48, bottom: AppSpacing.md),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: context.palette.action,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(AppRadius.md),
          topRight: Radius.circular(AppRadius.md),
          bottomLeft: Radius.circular(AppRadius.md),
          bottomRight: Radius.circular(4),
        ),
      ),
      child: Text(message.text, style: context.text.bodyLarge?.copyWith(color: context.palette.onAction)),
    ),
  );
}

/// The assistant's turn: its live tool trace, the answer, and its sources.
class AssistantBubble extends StatelessWidget {
  const AssistantBubble({required this.message, super.key});

  final AssistantMessage message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 24, bottom: AppSpacing.md),
    child: GlassContainer.card(
      padding: const EdgeInsets.all(AppSpacing.md),
      shape: const LiquidRoundedSuperellipse(borderRadius: AppRadius.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AiPill(label: 'MedVerify'),
          if (message.tools.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [for (final tool in message.tools) _ToolChip(tool: tool)],
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          if (message.error != null)
            Text(message.error!, style: context.text.bodyLarge?.copyWith(color: context.palette.danger))
          else if (message.text != null)
            SimpleMarkdown(message.text!)
          else
            const AppShimmer(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ShimmerLine(widthFactor: 0.9),
                  SizedBox(height: AppSpacing.xs),
                  ShimmerLine(widthFactor: 0.6),
                ],
              ),
            ),
          if (message.citations.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text('Sources', style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xxs),
            for (final citation in message.citations) _CitationRow(citation: citation),
          ],
        ],
      ),
    ),
  );
}

class _ToolChip extends StatelessWidget {
  const _ToolChip({required this.tool});

  final ToolTrace tool;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs + 2),
      decoration: BoxDecoration(color: palette.aiContainer, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            !tool.done ? Iconsax.search_normal : (tool.ok ? Iconsax.tick_circle : Iconsax.info_circle),
            size: 14,
            color: palette.aiGradient.first,
          ),
          const SizedBox(width: AppSpacing.xxs),
          Text(tool.label, style: context.text.labelMedium?.copyWith(color: palette.aiGradient.first)),
        ],
      ),
    );
    return Tooltip(
      message: tool.summary ?? tool.label,
      child: tool.done ? chip : AppShimmer(child: chip),
    );
  }
}

class _CitationRow extends StatelessWidget {
  const _CitationRow({required this.citation});

  final Citation citation;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(AppRadius.sm),
    onTap: () => launchUrl(Uri.parse(citation.url), mode: LaunchMode.externalApplication),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('[${citation.n}] ', style: context.text.labelLarge?.copyWith(color: context.palette.info)),
          Expanded(
            child: Text(
              '${citation.publisher} — ${citation.title}',
              style: context.text.bodyMedium?.copyWith(
                color: context.palette.info,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
          Icon(Iconsax.export_3, size: 14, color: context.palette.info),
        ],
      ),
    ),
  );
}
