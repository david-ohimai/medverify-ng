import 'package:flutter/material.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

/// The little Markdown the assistant writes: paragraphs, "- " / "* " bullets
/// and **bold**. Anything else is shown as plain text, never interpreted.
class SimpleMarkdown extends StatelessWidget {
  const SimpleMarkdown(this.text, {super.key});

  final String text;

  static final _bullet = RegExp(r'^\s*[-*•]\s+');
  static final _bold = RegExp(r'\*\*(.+?)\*\*');

  List<InlineSpan> _spans(String line, TextStyle? style) {
    final spans = <InlineSpan>[];
    var start = 0;
    for (final match in _bold.allMatches(line)) {
      if (match.start > start) spans.add(TextSpan(text: line.substring(start, match.start)));
      spans.add(
        TextSpan(
          text: match[1],
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      );
      start = match.end;
    }
    if (start < line.length) spans.add(TextSpan(text: line.substring(start)));
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final style = context.text.bodyLarge;
    final lines = text.split('\n').where((line) => line.trim().isNotEmpty);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final line in lines)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: _bullet.hasMatch(line)
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('•  ', style: style),
                      Expanded(
                        child: Text.rich(
                          TextSpan(style: style, children: _spans(line.replaceFirst(_bullet, ''), style)),
                        ),
                      ),
                    ],
                  )
                : Text.rich(TextSpan(style: style, children: _spans(line, style))),
          ),
      ],
    );
  }
}
