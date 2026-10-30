import 'package:equatable/equatable.dart';

import 'scan_result.dart';

/// The pipeline steps, in order, as the server streams them.
enum PipelineStep {
  receive('receive', 'Photo received'),
  readLabel('read_label', 'Reading the label'),
  registry('registry', 'Checking the NAFDAC register'),
  batchCheck('batch_check', 'Checking the batch'),
  comparePack('compare_pack', 'Comparing with the genuine pack'),
  score('score', 'Scoring the risk');

  const PipelineStep(this.code, this.defaultLabel);
  final String code;
  final String defaultLabel;

  static PipelineStep? fromCode(Object? code) => values.where((s) => s.code == code).firstOrNull;
}

enum StepStatus { waiting, active, done, skipped }

class StepView extends Equatable {
  const StepView({required this.step, required this.state, required this.label, this.detail});

  final PipelineStep step;
  final StepStatus state;
  final String label;
  final String? detail;

  StepView copyWith({StepStatus? state, String? label, String? detail}) =>
      StepView(step: step, state: state ?? this.state, label: label ?? this.label, detail: detail ?? this.detail);

  @override
  List<Object?> get props => [step, state, label, detail];
}

/// Everything the "watch the AI think" screen shows.
class ScanProgress extends Equatable {
  const ScanProgress({required this.steps, this.result, this.errorMessage});

  factory ScanProgress.initial() => ScanProgress(
    steps: [
      for (final step in PipelineStep.values)
        StepView(
          step: step,
          // The upload already finished when this screen opens.
          state: step == PipelineStep.receive ? StepStatus.done : StepStatus.waiting,
          label: step.defaultLabel,
        ),
    ],
  );

  final List<StepView> steps;
  final ScanResult? result;
  final String? errorMessage;

  bool get finished => result != null || errorMessage != null;

  ScanProgress withStep(StepView update) => ScanProgress(
    steps: [for (final s in steps) s.step == update.step ? update : s],
    result: result,
    errorMessage: errorMessage,
  );

  ScanProgress finish({ScanResult? result, String? errorMessage}) => ScanProgress(
    // A finished scan has no step left "active".
    steps: [for (final s in steps) s.state == StepStatus.active ? s.copyWith(state: StepStatus.done) : s],
    result: result,
    errorMessage: errorMessage,
  );

  @override
  List<Object?> get props => [steps, result, errorMessage];
}
