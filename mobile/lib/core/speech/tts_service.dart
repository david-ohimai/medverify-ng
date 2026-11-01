import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../logging/app_log.dart';

/// Reads text aloud with the phone's own voices (free, offline once
/// installed). Hausa, Yoruba and Igbo voices exist on some phones only, so
/// [speak] says whether a voice was found; callers show the text either way.
class TtsService {
  TtsService() : _tts = FlutterTts();

  final FlutterTts _tts;

  /// The locale the server asked for, then English fallbacks (Pidgin is read
  /// by an English voice; Nigerian English first when the phone has it).
  static List<String> _candidates(String locale) => {
    locale,
    if (locale.startsWith('en')) ...['en-NG', 'en-GB', 'en-US'],
  }.toList();

  /// Speaks [text]; returns false when no voice for [locale] is installed.
  Future<bool> speak(String text, {required String locale}) async {
    try {
      for (final candidate in _candidates(locale)) {
        if (await _tts.isLanguageAvailable(candidate) == true) {
          await _tts.setLanguage(candidate);
          await _tts.setSpeechRate(0.45);
          await _tts.awaitSpeakCompletion(true);
          AppLog.info('Speaking with $candidate');
          await _tts.speak(text);
          return true;
        }
      }
      AppLog.info('No voice for $locale on this phone');
      return false;
    } catch (error) {
      AppLog.info('Speech failed: $error');
      return false;
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {
      // Nothing playing.
    }
  }
}

final ttsServiceProvider = Provider<TtsService>((ref) {
  final tts = TtsService();
  ref.onDispose(tts.stop);
  return tts;
});
