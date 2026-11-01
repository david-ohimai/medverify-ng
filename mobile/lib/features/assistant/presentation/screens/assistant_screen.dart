import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/detail_scaffold.dart';
import '../../domain/chat_message.dart';
import '../../../regulator/presentation/providers/regulator_providers.dart';
import '../providers/assistant_providers.dart';
import '../widgets/chat_bubbles.dart';

/// Ask MedVerify: answers from the NAFDAC register, your scans, nearby
/// warnings and official WHO / NAFDAC documents — with sources.
class AssistantScreen extends ConsumerWidget {
  const AssistantScreen({this.initialQuestion, super.key});

  /// Pre-filled from a verdict ("Ask MedVerify about this").
  final String? initialQuestion;

  @override
  Widget build(BuildContext context, WidgetRef ref) => DetailScaffold(
    title: 'Ask MedVerify',
    body: const _Conversation(),
    bottom: _Composer(initialText: initialQuestion),
  );
}

class _Conversation extends ConsumerWidget {
  const _Conversation();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messages = ref.watch(chatControllerProvider.select((s) => s.messages));
    if (messages.isEmpty) return const _Suggestions();
    // Reversed, so the newest message sits above the composer and the list
    // follows the answer as it grows.
    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.fromLTRB(AppSpacing.gutter, AppSpacing.md, AppSpacing.gutter, AppSpacing.md),
      itemCount: messages.length,
      itemBuilder: (_, i) => switch (messages[messages.length - 1 - i]) {
        final UserMessage m => UserBubble(message: m),
        final AssistantMessage m => AssistantBubble(message: m),
      },
    );
  }
}

class _Suggestions extends ConsumerWidget {
  const _Suggestions();

  @override
  Widget build(BuildContext context, WidgetRef ref) => ListView(
    padding: const EdgeInsets.all(AppSpacing.gutter),
    children: [
      Icon(Iconsax.magic_star, size: 48, color: context.palette.aiGradient.first),
      const SizedBox(height: AppSpacing.md),
      Text('Ask about a medicine', style: context.text.headlineSmall, textAlign: TextAlign.center),
      const SizedBox(height: AppSpacing.xs),
      Text(
        'Answers come from the NAFDAC register, your own checks, warnings near you and official WHO and NAFDAC '
        'documents — with the sources.',
        style: context.text.bodyMedium,
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: AppSpacing.xl),
      for (final question
          in ref.watch(isRegulatorProvider) ? ChatController.regulatorSuggestions : ChatController.suggestions)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: OutlinedButton(
            onPressed: () => ref.read(chatControllerProvider.notifier).send(question),
            style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, minimumSize: const Size.fromHeight(52)),
            child: Text(question, style: context.text.bodyLarge),
          ),
        ),
    ],
  );
}

/// Stateful only to own the TextEditingController's lifecycle (it is never
/// rebuilt through setState); the conversation lives in [chatControllerProvider].
class _Composer extends ConsumerStatefulWidget {
  const _Composer({this.initialText});

  final String? initialText;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  late final _controller = TextEditingController(text: widget.initialText);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    ref.read(chatControllerProvider.notifier).send(_controller.text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final busy = ref.watch(chatControllerProvider.select((s) => s.busy));
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.gutter, AppSpacing.xs, AppSpacing.gutter, AppSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              minLines: 1,
              maxLines: 4,
              maxLength: 1000,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => busy ? null : _send(),
              decoration: const InputDecoration(hintText: 'Ask about a medicine…', counterText: ''),
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          IconButton.filled(
            onPressed: busy ? null : _send,
            style: IconButton.styleFrom(
              backgroundColor: context.palette.action,
              foregroundColor: context.palette.onAction,
              minimumSize: const Size(56, 56),
            ),
            icon: Icon(busy ? Iconsax.timer_1 : Iconsax.send_1),
            tooltip: 'Send',
          ),
        ],
      ),
    );
  }
}
