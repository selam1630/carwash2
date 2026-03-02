import 'package:flutter/material.dart';

import '../widgets/logout_action.dart';
import '../widgets/sales_nav_menu.dart';
import '../widgets/theme_mode_action.dart';

class SalesDashboardScreen extends StatelessWidget {
  const SalesDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget tile({
      required String title,
      required String subtitle,
      required IconData icon,
      required String route,
    }) {
      return Card(
        child: ListTile(
          leading: Icon(icon),
          title: Text(title),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.pushNamed(context, route),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales Dashboard'),
        actions: const [SalesNavMenu(), ThemeModeAction(), LogoutAction()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          tile(
            title: 'Register Owner',
            subtitle: 'Add a new owner and upload required photos',
            icon: Icons.person_add_alt_1,
            route: '/sales/register-owner',
          ),
          tile(
            title: 'Register Sales',
            subtitle: 'Recruit and onboard a new sales person',
            icon: Icons.group_add,
            route: '/sales/register-sales',
          ),
          tile(
            title: 'Re-subscription Reminders',
            subtitle: 'See customers assigned to you for follow-up calls',
            icon: Icons.call,
            route: '/sales/reminders',
          ),
          tile(
            title: 'My Commissions',
            subtitle: 'Track pending and paid commissions',
            icon: Icons.payments,
            route: '/sales/commissions',
          ),
        ],
      ),
    );
  }
}

