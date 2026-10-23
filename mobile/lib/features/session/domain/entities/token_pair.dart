import 'package:equatable/equatable.dart';

class TokenPair extends Equatable {
  const TokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  @override
  List<Object?> get props => [accessToken, refreshToken];

  /// Never print tokens.
  @override
  String toString() => 'TokenPair(***)';
}
