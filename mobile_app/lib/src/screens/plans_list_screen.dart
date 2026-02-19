import 'package:flutter/material.dart';
import '../widgets/logout_action.dart';
import '../widgets/theme_mode_action.dart';

class PlansListScreen extends StatelessWidget {
  const PlansListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // TODO: fetch plans from API
    final plans = [
      {'name': 'Basic', 'washes': 4},
      {'name': 'Standard', 'washes': 6},
      {'name': 'Premium', 'washes': 8},
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Plans'),
        actions: const [ThemeModeAction(), LogoutAction()],
      ),
      body: ListView.builder(
        itemCount: plans.length,
        itemBuilder: (context, i) {
          final p = plans[i];
          return ListTile(title: Text(p['name'] as String), subtitle: Text('${p['washes']} washes'));
        },
      ),
    );
  }
}
