import 'package:flutter/material.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../core/constants/app_language.dart';
import '../../core/extensions/context_x.dart';
import '../../core/theme/app_dimens.dart';

/// One selectable language row, used in onboarding and settings.
class LanguageOptionTile extends StatelessWidget {
  const LanguageOptionTile({required this.language, required this.selected, required this.onTap, super.key});

  final AppLanguage language;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Material(
        color: selected ? palette.actionContainer : context.colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          side: BorderSide(color: selected ? palette.action : palette.cardBorder, width: selected ? 1.5 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
            child: Row(
              children: [
                Expanded(child: Text(language.nativeName, style: context.text.titleMedium)),
                if (language.nativeName != language.englishName)
                  Text(language.englishName, style: context.text.bodySmall),
                const SizedBox(width: AppSpacing.sm),
                Icon(
                  selected ? Iconsax.tick_circle_copy : Iconsax.record,
                  color: selected ? palette.action : context.colors.outline,
                  size: 22,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
