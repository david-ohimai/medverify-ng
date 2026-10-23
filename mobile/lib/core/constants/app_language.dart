/// Languages the app speaks. Codes match the server's AppLanguage enum.
enum AppLanguage {
  en('en', 'English', 'English'),
  pcm('pcm', 'Pidgin', 'Naija Pidgin'),
  ha('ha', 'Hausa', 'Hausa'),
  yo('yo', 'Yoruba', 'Yorùbá'),
  ig('ig', 'Igbo', 'Igbo');

  const AppLanguage(this.code, this.englishName, this.nativeName);

  final String code;
  final String englishName;
  final String nativeName;

  static AppLanguage fromCode(String? code) =>
      values.firstWhere((language) => language.code == code, orElse: () => AppLanguage.en);
}
