import 'package:equatable/equatable.dart';

/// A source the assistant cited — always an official WHO or NAFDAC page.
class Citation extends Equatable {
  const Citation({
    required this.n,
    required this.title,
    required this.publisher,
    required this.url,
    required this.retrieved,
  });

  final int n;
  final String title;
  final String publisher;
  final String url;
  final String retrieved;

  static Citation fromJson(Map<String, dynamic> json) => Citation(
    n: (json['n'] as num).toInt(),
    title: json['title'] as String,
    publisher: json['publisher'] as String,
    url: json['url'] as String,
    retrieved: json['retrieved'] as String? ?? '',
  );

  @override
  List<Object?> get props => [n, url];
}

/// One tool call in the live trace ("Searching WHO & NAFDAC guidance…").
class ToolTrace extends Equatable {
  const ToolTrace({required this.name, this.done = false, this.ok = true, this.summary});

  final String name;
  final bool done;
  final bool ok;
  final String? summary;

  /// Plain-language label for the chip.
  String get label => switch (name) {
    'search_guidance' => 'Searching WHO & NAFDAC guidance',
    'search_registry' => 'Searching the NAFDAC register',
    'check_product' => 'Checking the NAFDAC number',
    'check_batch' => 'Checking the batch',
    'my_recent_scans' => 'Looking at your recent checks',
    'alerts_near_area' => 'Looking for warnings nearby',
    'hotspot_overview' => 'Reviewing hotspots',
    'hotspot_alerts' => 'Reading hotspot alerts',
    _ => 'Looking things up',
  };

  ToolTrace finish({required bool ok, String? summary}) => ToolTrace(name: name, done: true, ok: ok, summary: summary);

  @override
  List<Object?> get props => [name, done, ok, summary];
}

sealed class ChatMessage extends Equatable {
  const ChatMessage();
}

final class UserMessage extends ChatMessage {
  const UserMessage(this.text);
  final String text;
  @override
  List<Object?> get props => [text];
}

final class AssistantMessage extends ChatMessage {
  const AssistantMessage({
    this.text,
    this.tools = const [],
    this.citations = const [],
    this.pending = true,
    this.error,
  });

  final String? text;
  final List<ToolTrace> tools;
  final List<Citation> citations;
  final bool pending;
  final String? error;

  AssistantMessage copyWith({
    String? text,
    List<ToolTrace>? tools,
    List<Citation>? citations,
    bool? pending,
    String? error,
  }) => AssistantMessage(
    text: text ?? this.text,
    tools: tools ?? this.tools,
    citations: citations ?? this.citations,
    pending: pending ?? this.pending,
    error: error ?? this.error,
  );

  @override
  List<Object?> get props => [text, tools, citations, pending, error];
}
