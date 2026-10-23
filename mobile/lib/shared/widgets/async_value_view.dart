import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/failure.dart';
import 'error_view.dart';

/// One way to render any AsyncValue: a shimmer skeleton while loading, an
/// [ErrorView] with retry on failure, the content on success. Keeps loading
/// and error handling out of every screen.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    required this.value,
    required this.data,
    required this.loading,
    this.onRetry,
    super.key,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;

  /// A skeleton shaped like the content (see shared/widgets/shimmer/).
  final Widget loading;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => switch (value) {
    AsyncData(:final value) => data(value),
    AsyncError(:final error) => ErrorView(
      message: error is Failure ? error.message : 'Something went wrong.',
      onRetry: onRetry,
    ),
    AsyncLoading() => loading,
  };
}
