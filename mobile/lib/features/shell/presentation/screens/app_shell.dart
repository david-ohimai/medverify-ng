import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

import '../../../../shared/widgets/app_backdrop.dart';
import '../widgets/app_tab_bar.dart';

/// The frame around the five tabs: mesh backdrop, the current tab's page, and
/// the floating liquid-glass tab bar. Stateless — go_router's navigation shell
/// owns which tab is selected.
class AppShell extends StatelessWidget {
  const AppShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  void _onTabSelected(int index) {
    // Tapping the current tab again returns it to its first page.
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) => GlassScaffold(
    background: const AppBackdrop(),
    body: navigationShell,
    bottomBar: AppTabBar(selectedIndex: navigationShell.currentIndex, onTabSelected: _onTabSelected),
  );
}
