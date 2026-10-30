import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../core/constants/app_constants.dart';
import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';
import 'app_backdrop.dart';

/// A full-screen page pushed over the tabs (scan progress, verdict, manual
/// check, assistant): the same backdrop, a back button, and content centred
/// and capped on tablets. [bottom] stays pinned above the keyboard.
class DetailScaffold extends StatelessWidget {
  const DetailScaffold({required this.title, required this.body, this.bottom, this.onBack, super.key});

  final String title;
  final Widget body;
  final Widget? bottom;

  /// Defaults to popping, or going home if there is nothing to pop to.
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    body: Stack(
      children: [
        const Positioned.fill(child: AppBackdrop()),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.xs, AppSpacing.xs, AppSpacing.gutter, 0),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Back',
                      icon: const Icon(Iconsax.arrow_left),
                      onPressed: onBack ?? () => context.canPop() ? context.pop() : context.go('/home'),
                    ),
                    const SizedBox(width: AppSpacing.xxs),
                    Expanded(
                      child: Text(title, style: context.text.headlineSmall, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: AppConstants.maxContentWidth),
                    child: body,
                  ),
                ),
              ),
              if (bottom != null)
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: AppConstants.maxContentWidth),
                    child: bottom,
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}
