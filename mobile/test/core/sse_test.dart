import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:medverify/core/network/sse.dart';

Stream<List<int>> _chunks(List<String> parts) => Stream.fromIterable([for (final p in parts) utf8.encode(p)]);

void main() {
  test('parses events with ids and JSON data, skipping heartbeats', () async {
    final events = await parseSse(
      _chunks([
        'id: 1\nevent: step\ndata: {"step":"read_label","status":"active"}\n\n',
        ': ping\n\n',
        'id: 2\nevent: verdict\ndata: {"result":{"verdict":"suspicious"}}\n\n',
      ]),
    ).toList();

    expect(events.map((e) => e.event), ['step', 'verdict']);
    expect(events.first.id, '1');
    expect(events.first.json['status'], 'active');
    expect((events.last.json['result'] as Map)['verdict'], 'suspicious');
  });

  test('an event split across network chunks is put back together', () async {
    final events = await parseSse(_chunks(['event: ans', 'wer\ndata: {"text":"Hel', 'lo"}\n', '\n'])).toList();
    expect(events.single.event, 'answer');
    expect(events.single.json['text'], 'Hello');
  });

  test('non-JSON data stays text; a last event without a blank line still arrives', () async {
    final events = await parseSse(_chunks(['data: plain words\n\nevent: done\ndata: {}'])).toList();
    expect(events.first.data, 'plain words');
    expect(events.first.event, 'message');
    expect(events.last.event, 'done');
  });
}
