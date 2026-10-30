import 'dart:async';
import 'dart:convert';

/// One Server-Sent Event: `event:` name, `data:` (decoded JSON when it is
/// JSON) and `id:`.
class SseEvent {
  const SseEvent({required this.event, required this.data, this.id});

  final String event;
  final Object? data;
  final String? id;

  /// The data as a JSON object (every MedVerify event is one).
  Map<String, dynamic> get json => data is Map<String, dynamic> ? data! as Map<String, dynamic> : const {};
}

/// Parses a `text/event-stream` byte stream into events. Comment lines
/// (": ping" heartbeats) are skipped; an event ends at a blank line.
/// Small and dependency-free on purpose — it's the whole SSE client.
Stream<SseEvent> parseSse(Stream<List<int>> bytes) async* {
  String? event;
  String? id;
  final data = StringBuffer();

  SseEvent? flush() {
    if (data.isEmpty && event == null) return null;
    final raw = data.toString();
    Object? decoded = raw;
    try {
      decoded = raw.isEmpty ? null : jsonDecode(raw);
    } on FormatException {
      // Not JSON: keep the text.
    }
    final result = SseEvent(event: event ?? 'message', data: decoded, id: id);
    event = null;
    data.clear();
    return result;
  }

  await for (final line in bytes.cast<List<int>>().transform(utf8.decoder).transform(const LineSplitter())) {
    if (line.isEmpty) {
      final complete = flush();
      if (complete != null) yield complete;
      continue;
    }
    if (line.startsWith(':')) continue;
    final colon = line.indexOf(':');
    final field = colon == -1 ? line : line.substring(0, colon);
    var value = colon == -1 ? '' : line.substring(colon + 1);
    if (value.startsWith(' ')) value = value.substring(1);
    switch (field) {
      case 'event':
        event = value;
      case 'data':
        if (data.isNotEmpty) data.write('\n');
        data.write(value);
      case 'id':
        id = value;
    }
  }
  final last = flush();
  if (last != null) yield last;
}
