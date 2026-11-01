import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_language.dart';
import '../../../../core/errors/failure.dart';
import '../../../../core/locale/language_controller.dart';
import '../../../../core/result/result.dart';
import '../../../../core/speech/tts_service.dart';
import 'scan_providers.dart';

class ListenState extends Equatable {
  const ListenState({
    required this.language,
    this.loading = false,
    this.speaking = false,
    this.text,
    this.voiceMissing = false,
    this.error,
  });

  final AppLanguage language;
  final bool loading;
  final bool speaking;

  /// The verdict in [language], once fetched — always shown, even without a voice.
  final String? text;

  /// The phone has no voice for [language]: the text is shown, not spoken.
  final bool voiceMissing;
  final String? error;

  @override
  List<Object?> get props => [language, loading, speaking, text, voiceMissing, error];
}

final listenControllerProvider = NotifierProvider.autoDispose.family<ListenController, ListenState, String>(
  ListenController.new,
);

/// "🔊 Listen" on a verdict: fetch the verdict in the chosen language
/// (translated by the server, cached there), then read it aloud.
class ListenController extends Notifier<ListenState> {
  ListenController(this.scanId);

  final String scanId;
  final _texts = <AppLanguage, ({String text, String locale})>{};

  @override
  ListenState build() {
    // Leaving the verdict stops the voice. (Read now: ref can't be used inside onDispose.)
    final tts = ref.read(ttsServiceProvider);
    ref.onDispose(tts.stop);
    return ListenState(language: ref.read(languageProvider));
  }

  Future<void> selectLanguage(AppLanguage language) async {
    await ref.read(ttsServiceProvider).stop();
    state = ListenState(language: language, text: _texts[language]?.text);
  }

  Future<void> play() async {
    if (state.loading || state.speaking) return;
    final language = state.language;
    var speech = _texts[language];
    if (speech == null) {
      state = ListenState(language: language, loading: true);
      final result = await ref.read(scanRepositoryProvider).speech(scanId, language.code);
      if (!ref.mounted) return;
      switch (result) {
        case Success(:final value):
          speech = (text: value.text, locale: value.ttsLocale);
          _texts[language] = speech;
        case Err(:final failure):
          // English needs no translation: read the verdict already on screen.
          final onScreen = language == AppLanguage.en ? _englishFromVerdict() : null;
          if (onScreen == null) {
            state = ListenState(language: language, error: _messageFor(failure, language));
            return;
          }
          speech = (text: onScreen, locale: 'en-NG');
      }
    }

    state = ListenState(language: language, text: speech.text, speaking: true);
    final spoke = await ref.read(ttsServiceProvider).speak(speech.text, locale: speech.locale);
    if (!ref.mounted || state.language != language) return;
    state = ListenState(language: language, text: speech.text, voiceMissing: !spoke);
  }

  String? _englishFromVerdict() {
    final scan = ref.read(scanResultProvider(scanId)).value;
    if (scan == null) return null;
    return '${scan.headline}. ${scan.advice}';
  }

  /// Short, plain words for the card. Offline, slow or over the daily limit
  /// already read well; anything else (a server fault) gets one calm line.
  static String _messageFor(Failure failure, AppLanguage language) => switch (failure) {
    NetworkFailure() || TimeoutFailure() || RateLimitedFailure() => failure.message,
    _ => 'The ${language.englishName} version isn’t available right now.',
  };

  Future<void> stop() async {
    await ref.read(ttsServiceProvider).stop();
    state = ListenState(language: state.language, text: state.text);
  }
}
