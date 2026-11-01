import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:iconsax_flutter/iconsax_flutter.dart';

import '../../../../shared/widgets/ai_insight_card.dart';

/// Injectable clock, so time-based logic is testable.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Injectable randomness, so the tip picker is testable.
final randomProvider = Provider<Random>((ref) => Random());

/// "Good morning" / "Good afternoon" / "Good evening", computed here, not in the widget.
final greetingProvider = Provider<String>((ref) {
  final hour = ref.watch(clockProvider)().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
});

/// Safety tips for the Home card. Facts come from the official WHO and NAFDAC
/// documents in the assistant's knowledge base (server/kb/documents/).
const homeTips = <InsightLine>[
  InsightLine(
    icon: Iconsax.scan_barcode,
    text: 'Scan the side with the NAFDAC number, MedVerify reads the number, batch and expiry for you.',
    tone: InsightTone.info,
  ),
  InsightLine(
    icon: Iconsax.danger,
    text: 'WHO estimates that at least 1 in 10 medicines in low- and middle-income countries is substandard or falsified.',
    tone: InsightTone.warning,
  ),
  InsightLine(
    icon: Iconsax.message_text,
    text: 'Many antimalarials and antibiotics have a scratch-off PIN: text it free to the short code on the pack (NAFDAC MAS).',
    tone: InsightTone.info,
  ),
  InsightLine(
    icon: Iconsax.calendar_remove,
    text: 'Never take a medicine past its expiry date, return it to the pharmacy.',
    tone: InsightTone.danger,
  ),
  InsightLine(
    icon: Iconsax.call,
    text: 'Report a suspected fake medicine to NAFDAC on 0800-162-3322 or sf.alert@nafdac.gov.ng.',
    tone: InsightTone.info,
  ),
  InsightLine(
    icon: Iconsax.text_block,
    text: 'Spelling mistakes, smudged print or an odd logo on a pack are common signs of a fake.',
    tone: InsightTone.warning,
  ),
  InsightLine(
    icon: Iconsax.shop,
    text: 'Buy from licensed pharmacies: NAFDAC advises getting medicines only from authorised suppliers.',
  ),
  InsightLine(
    icon: Iconsax.copy,
    text: 'A real NAFDAC number printed on a different product is a common counterfeit trick, check the name matches.',
    tone: InsightTone.warning,
  ),
  InsightLine(icon: Iconsax.box_tick, text: 'Check that the pack is sealed and undamaged before you buy.'),
  InsightLine(icon: Iconsax.people, text: 'Every suspicious scan helps warn people near you.'),
  InsightLine(
    icon: Iconsax.magic_star,
    text: 'Not sure? Ask MedVerify! Answers come from official WHO and NAFDAC guidance, with the sources.',
    tone: InsightTone.info,
  ),
  InsightLine(
    icon: Iconsax.global,
    text: 'Medicines from unlicensed market stalls or unauthorised websites are more likely to be falsified.',
    tone: InsightTone.warning,
  ),
  InsightLine(
    icon: Iconsax.keyboard,
    text: 'Typed in a NAFDAC number? Scan the pack too, fakes often copy real numbers.',
    tone: InsightTone.info,
  ),
  InsightLine(
    icon: Iconsax.health,
    text: 'Fake antimalarials can mean treatment failure, worse illness and drug resistance.',
    tone: InsightTone.danger,
  ),
];

/// Three random tips for the Home card: a new set every time Home comes into
/// view (the router calls [HomeInsights.shuffle] on each navigation to Home).
final homeInsightsProvider = NotifierProvider<HomeInsights, List<InsightLine>>(HomeInsights.new);

class HomeInsights extends Notifier<List<InsightLine>> {
  static const count = 3;

  @override
  List<InsightLine> build() => _pick();

  void shuffle() => state = _pick();

  List<InsightLine> _pick() => ([...homeTips]..shuffle(ref.read(randomProvider))).take(count).toList(growable: false);
}
