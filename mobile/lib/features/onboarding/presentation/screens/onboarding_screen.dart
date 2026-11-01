import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../core/extensions/context_x.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../shared/widgets/app_backdrop.dart';
import '../providers/onboarding_providers.dart';
import '../widgets/language_picker.dart';
import '../widgets/onboarding_slide.dart';
import '../widgets/page_dots.dart';

/// Three slides: what MedVerify does, pick a language, the safety promise.
///
/// Stateful only to own the PageController's lifecycle; it never mutates
/// local state. The page and language live in [onboardingControllerProvider],
/// and the PageView follows the controller via ref.listen.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pageController = PageController();

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // "Next" changes the page in the controller; animate the PageView to match.
    ref.listen(onboardingControllerProvider.select((s) => s.page), (_, page) {
      if (_pageController.hasClients && _pageController.page?.round() != page) {
        _pageController.animateToPage(page, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
      }
    });
    final controller = ref.read(onboardingControllerProvider.notifier);

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: AppBackdrop()),
          SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: PageView(
                    controller: _pageController,
                    onPageChanged: controller.pageChanged,
                    children: const [
                      OnboardingSlide(
                        icon: Iconsax.scan_barcode,
                        title: 'Verify a medicine before you take it',
                        message:
                            'Scan any medicine pack. MedVerify reads the label, checks it against NAFDAC '
                            'records and compares it with genuine packs in seconds.',
                      ),
                      OnboardingSlide(
                        icon: Iconsax.language_square,
                        title: 'Choose your language',
                        message: 'Results can be read and heard in your language.',
                        child: LanguagePicker(),
                      ),
                      OnboardingSlide(
                        icon: Iconsax.shield_tick,
                        title: 'A careful second opinion',
                        message:
                            'MedVerify never says a medicine is 100% safe. If a pack looks suspicious, show it to a '
                            'pharmacist or report it. Your location is only used, rounded, to warn others nearby.',
                      ),
                    ],
                  ),
                ),
                const _OnboardingFooter(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Dots and buttons. Rebuilds only when the page changes, not on language picks.
class _OnboardingFooter extends ConsumerWidget {
  const _OnboardingFooter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = ref.watch(onboardingControllerProvider.select((s) => s.page));
    final isLast = page == OnboardingController.pageCount - 1;
    final controller = ref.read(onboardingControllerProvider.notifier);

    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.gutter, AppSpacing.md, AppSpacing.gutter, AppSpacing.xl),
      child: Column(
        children: [
          PageDots(count: OnboardingController.pageCount, current: page),
          const SizedBox(height: AppSpacing.xl),
          FilledButton(
            onPressed: isLast ? controller.finish : controller.next,
            child: Text(isLast ? 'Get started' : 'Next'),
          ),
          const SizedBox(height: AppSpacing.xs),
          // Keep the layout steady: the skip button only fades out.
          AnimatedOpacity(
            opacity: isLast ? 0 : 1,
            duration: const Duration(milliseconds: 200),
            child: TextButton(
              onPressed: isLast ? null : controller.finish,
              child: Text('Skip', style: TextStyle(color: context.colors.onSurfaceVariant)),
            ),
          ),
        ],
      ),
    );
  }
}
