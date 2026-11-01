import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/failure.dart';
import 'error_view.dart';

/// One way to render any AsyncValue: a shimmer skeleton while loading, an
/// [ErrorView] with retry on failure, the content on success. Keeps loading
/// and error handling out of every screen.
///
/// Once there is content it stays on screen: a background refresh, or one
/// that fails, never swaps it for a skeleton or an error.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({required this.value, required this.data, required this.loading, this.onRetry, super.key});

  final AsyncValue<T> value;
  final Widget Function(T data) data;

  /// A skeleton shaped like the content (see shared/widgets/shimmer/).
  final Widget loading;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => switch (value) {
    AsyncValue(hasValue: true) => data(value.requireValue),
    AsyncData(:final value) => data(value),
    AsyncError(:final error) => ErrorView(
      message: error is Failure ? error.message : 'Something went wrong.',
      onRetry: onRetry,
    ),
    AsyncLoading() => loading,
  };
}
