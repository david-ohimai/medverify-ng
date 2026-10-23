import 'package:flutter/material.dart';

import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

/// Outlined pill tabs ("Personal Info | Settings"). The selected pill gets an
/// orange outline and orange text. Stateless: the selected index lives in a
/// provider owned by the screen.
class PillTabs extends StatelessWidget {
  const PillTabs({required this.labels, required this.selected, required this.onSelected, super.key});

  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: ChoiceChip(
                label: Text(labels[i]),
                selected: i == selected,
                showCheckmark: false,
                onSelected: (_) => onSelected(i),
                labelStyle: context.text.labelLarge?.copyWith(
                  color: i == selected ? palette.action : context.colors.onSurfaceVariant,
                  fontWeight: i == selected ? FontWeight.w700 : FontWeight.w500,
                ),
                backgroundColor: context.colors.surface,
                selectedColor: context.colors.surface,
                side: BorderSide(
                  color: i == selected ? palette.action : context.colors.outline,
                  width: i == selected ? 1.5 : 1,
                ),
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
              ),
            ),
        ],
      ),
    );
  }
}
