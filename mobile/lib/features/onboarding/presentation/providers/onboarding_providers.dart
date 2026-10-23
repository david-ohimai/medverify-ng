import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../core/locale/language_controller.dart';
import '../../../../core/storage/storage_providers.dart';

/// Whether onboarding has been completed. The router redirects on it.
final onboardingDoneProvider = NotifierProvider<OnboardingDone, bool>(OnboardingDone.new);

class OnboardingDone extends Notifier<bool> {
  @override
  bool build() => ref.watch(preferencesStoreProvider).onboardingDone;

  Future<void> complete() async {
    await ref.read(preferencesStoreProvider).setOnboardingDone();
    state = true;
  }
}

class OnboardingState extends Equatable {
  const OnboardingState({required this.page, required this.language});

  final int page;
  final AppLanguage language;

  bool get isLastPage => page == OnboardingController.pageCount - 1;

  OnboardingState copyWith({int? page, AppLanguage? language}) =>
      OnboardingState(page: page ?? this.page, language: language ?? this.language);

  @override
  List<Object?> get props => [page, language];
}

/// All onboarding logic: which page, which language, finishing.
/// Disposed when the onboarding screen leaves.
final onboardingControllerProvider = NotifierProvider.autoDispose<OnboardingController, OnboardingState>(
  OnboardingController.new,
);

class OnboardingController extends Notifier<OnboardingState> {
  static const int pageCount = 3;

  @override
  OnboardingState build() => OnboardingState(page: 0, language: ref.read(languageProvider));

  /// Called when the user swipes.
  void pageChanged(int page) => state = state.copyWith(page: page.clamp(0, pageCount - 1));

  void next() {
    if (!state.isLastPage) state = state.copyWith(page: state.page + 1);
  }

  void selectLanguage(AppLanguage language) => state = state.copyWith(language: language);

  Future<void> finish() async {
    await ref.read(languageProvider.notifier).select(state.language);
    await ref.read(onboardingDoneProvider.notifier).complete();
  }
}
