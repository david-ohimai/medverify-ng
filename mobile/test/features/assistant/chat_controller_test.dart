import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/errors/failure.dart';
import 'package:medverify/core/network/sse.dart';
import 'package:medverify/features/assistant/domain/chat_message.dart';
import 'package:medverify/features/assistant/presentation/providers/assistant_providers.dart';

void main() {
  late StreamController<SseEvent> events;
  late ProviderContainer container;
  final asked = <(String, String?)>[];

  setUp(() {
    events = StreamController<SseEvent>();
    asked.clear();
    container = ProviderContainer(
      overrides: [
        askAssistantProvider.overrideWithValue((message, conversationId) {
          asked.add((message, conversationId));
          return events.stream;
        }),
      ],
    );
    addTearDown(container.dispose);
  });

  test('a turn: tool chips start and finish, then the answer and its sources', () async {
    final sub = container.listen(chatControllerProvider, (_, _) {});
    addTearDown(sub.close);
    container.read(chatControllerProvider.notifier).send('  Is Postinor batch T36184B fake?  ');

    expect(asked.single, ('Is Postinor batch T36184B fake?', null));
    expect(sub.read().busy, isTrue);

    events
      ..add(const SseEvent(event: 'conversation', data: {'conversationId': 'c-1'}))
      ..add(const SseEvent(event: 'tool_start', data: {'name': 'search_guidance', 'args': {}}));
    await pumpEventQueue();
    var reply = sub.read().messages.last as AssistantMessage;
    expect(reply.tools.single.done, isFalse);
    expect(reply.tools.single.label, 'Searching WHO & NAFDAC guidance');

    events
      ..add(const SseEvent(event: 'tool_end', data: {'name': 'search_guidance', 'ok': true, 'summary': '5 passages'}))
      ..add(const SseEvent(event: 'answer', data: {'text': 'Yes — listed as counterfeit [1].'}))
      ..add(
        const SseEvent(
          event: 'citations',
          data: {
            'citations': [
              {
                'n': 1,
                'title': 'Public Alert 027/2025',
                'publisher': 'NAFDAC',
                'url': 'https://nafdac.gov.ng/x',
                'retrieved': '2026-10-29',
              },
            ],
          },
        ),
      )
      ..add(const SseEvent(event: 'done', data: {'conversationId': 'c-1', 'rounds': 2}));
    await pumpEventQueue();

    reply = sub.read().messages.last as AssistantMessage;
    expect(reply.tools.single.done, isTrue);
    expect(reply.text, contains('counterfeit'));
    expect(reply.citations.single.publisher, 'NAFDAC');
    expect(sub.read().busy, isFalse);
    expect(sub.read().conversationId, 'c-1');
  });

  test('the next question continues the same conversation', () async {
    final sub = container.listen(chatControllerProvider, (_, _) {});
    addTearDown(sub.close);
    container.read(chatControllerProvider.notifier).send('first');
    events
      ..add(const SseEvent(event: 'conversation', data: {'conversationId': 'c-9'}))
      ..add(const SseEvent(event: 'done', data: {}));
    await pumpEventQueue();

    events = StreamController<SseEvent>();
    container.read(chatControllerProvider.notifier).send('second');
    expect(asked.last, ('second', 'c-9'));
  });

  test('a failed stream shows the server message instead of hanging', () async {
    final sub = container.listen(chatControllerProvider, (_, _) {});
    addTearDown(sub.close);
    container.read(chatControllerProvider.notifier).send('hello');
    events.addError(const RateLimitedFailure('Daily question limit reached.'));
    await pumpEventQueue();
    final reply = sub.read().messages.last as AssistantMessage;
    expect(reply.error, 'Daily question limit reached.');
    expect(sub.read().busy, isFalse);
  });

  test('empty questions and questions while busy are ignored', () {
    final controller = container.read(chatControllerProvider.notifier);
    controller.send('   ');
    expect(asked, isEmpty);
    controller.send('one');
    controller.send('two');
    expect(asked.length, 1);
  });
}
