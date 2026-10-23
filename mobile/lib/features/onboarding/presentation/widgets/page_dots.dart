import 'package:flutter/material.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';

class PageDots extends StatelessWidget {
  const PageDots({required this.count, required this.current, super.key});

  final int count;
  final int current;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Page ${current + 1} of $count',
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
            width: i == current ? 24 : 8,
            height: 8,
            decoration: BoxDecoration(
              color: i == current ? context.palette.action : context.colors.outline,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
          ),
      ],
    ),
  );
}
