import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/network/sse.dart';
import '../../domain/chat_message.dart';

/// Opens one assistant turn as an SSE stream. A function, so tests can fake it.
typedef AskAssistant = Stream<SseEvent> Function(String message, String? conversationId);

final askAssistantProvider = Provider<AskAssistant>((ref) {
  final client = ref.watch(apiClientProvider);
  return (message, conversationId) =>
      client.stream(ApiEndpoints.assistantMessages, body: {'message': message, 'conversationId': ?conversationId});
});

class ChatState extends Equatable {
  const ChatState({this.messages = const [], this.conversationId});

  final List<ChatMessage> messages;
  final String? conversationId;

  bool get busy => messages.lastOrNull is AssistantMessage && (messages.last as AssistantMessage).pending;

  ChatState withLast(AssistantMessage message) =>
      ChatState(messages: [...messages.take(messages.length - 1), message], conversationId: conversationId);

  @override
  List<Object?> get props => [messages, conversationId];
}

final chatControllerProvider = NotifierProvider.autoDispose<ChatController, ChatState>(ChatController.new);

/// One conversation. Each question streams: tool calls as they start and
/// finish (shown as shimmering chips), then the answer and its sources.
class ChatController extends Notifier<ChatState> {
  StreamSubscription<SseEvent>? _subscription;

  static const suggestions = [
    'How do I report a fake drug in Nigeria?',
    'What is the scratch code on medicine packs for?',
    'Has NAFDAC warned about fake Postinor?',
    'Are there any warnings near Idumota market?',
  ];

  @override
  ChatState build() {
    ref.onDispose(() => _subscription?.cancel());
    return const ChatState();
  }

  void send(String text) {
    final question = text.trim();
    if (question.isEmpty || state.busy) return;
    state = ChatState(
      messages: [...state.messages, UserMessage(question), const AssistantMessage()],
      conversationId: state.conversationId,
    );
    _subscription = ref
        .read(askAssistantProvider)(question, state.conversationId)
        .listen(_onEvent, onError: _onError, onDone: _onDone);
  }

  AssistantMessage get _reply => state.messages.last as AssistantMessage;

  void _onEvent(SseEvent event) {
    final json = event.json;
    switch (event.event) {
      case 'conversation':
        state = ChatState(messages: state.messages, conversationId: json['conversationId'] as String?);
      case 'tool_start':
        state = state.withLast(
          _reply.copyWith(
            tools: [
              ..._reply.tools,
              ToolTrace(name: json['name'] as String),
            ],
          ),
        );
      case 'tool_end':
        final tools = [..._reply.tools];
        final index = tools.lastIndexWhere((t) => t.name == json['name'] && !t.done);
        if (index >= 0) {
          tools[index] = tools[index].finish(ok: json['ok'] as bool? ?? true, summary: json['summary'] as String?);
        }
        state = state.withLast(_reply.copyWith(tools: tools));
      case 'answer':
        state = state.withLast(_reply.copyWith(text: json['text'] as String?));
      case 'citations':
        final list = (json['citations'] as List? ?? const []).cast<Map<String, dynamic>>();
        state = state.withLast(_reply.copyWith(citations: [for (final c in list) Citation.fromJson(c)]));
      case 'done':
        state = state.withLast(_reply.copyWith(pending: false));
      case 'error':
        state = state.withLast(
          _reply.copyWith(pending: false, error: json['message'] as String? ?? 'Something went wrong.'),
        );
    }
  }

  void _onError(Object error) {
    if (!ref.mounted || !state.busy) return;
    state = state.withLast(
      _reply.copyWith(pending: false, error: error is Failure ? error.message : 'Could not reach MedVerify.'),
    );
  }

  void _onDone() {
    // The stream ended without "done" (connection dropped mid-answer).
    if (ref.mounted && state.busy) state = state.withLast(_reply.copyWith(pending: false));
  }
}
