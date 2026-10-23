import 'package:flutter/material.dart';

import '../../core/constants/app_constants.dart';
import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

/// Standard scrolling page inside the tab shell: big title + subtitle (like
/// "Claims / Manage and create your claims here"), content slivers, and room
/// at the bottom so nothing hides under the floating glass tab bar.
/// Content is centred and capped at [AppConstants.maxContentWidth] on tablets.
class PageLayout extends StatelessWidget {
  const PageLayout({required this.title, required this.slivers, this.subtitle, this.trailing, super.key});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final List<Widget> slivers;

  @override
  Widget build(BuildContext context) {
    final width = context.screenWidth;
    final side = width > AppConstants.maxContentWidth + AppSpacing.gutter * 2
        ? (width - AppConstants.maxContentWidth) / 2
        : AppSpacing.gutter;

    return CustomScrollView(
      slivers: [
        SliverSafeArea(
          bottom: false,
          sliver: SliverPadding(
            padding: EdgeInsets.fromLTRB(side, AppSpacing.lg, side, AppSpacing.lg),
            sliver: SliverToBoxAdapter(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: context.text.headlineLarge),
                        if (subtitle != null) ...[
                          const SizedBox(height: AppSpacing.xxs),
                          Text(subtitle!, style: context.text.bodyMedium),
                        ],
                      ],
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          ),
        ),
        for (final sliver in slivers)
          SliverPadding(
            padding: EdgeInsets.symmetric(horizontal: side),
            sliver: sliver,
          ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.tabBarClearance)),
      ],
    );
  }
}

/// Section title with an optional action on the right ("Recent scans · See all").
class SectionHeader extends StatelessWidget {
  const SectionHeader({required this.title, this.action, super.key});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
    child: Row(
      children: [
        Expanded(child: Text(title, style: context.text.titleLarge)),
        ?action,
      ],
    ),
  );
}
