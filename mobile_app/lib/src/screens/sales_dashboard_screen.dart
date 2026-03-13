import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
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
        elevation: 3,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.pushNamed(context, route),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: AppTheme.skyBlue.withOpacity(0.25),
                  ),
                  child: Icon(icon, color: AppTheme.deepBlue),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppTheme.navyBlue,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(subtitle),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
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
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(
                colors: [AppTheme.navyBlue, AppTheme.oceanBlue],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sales Command Center',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  'Manage registrations, follow-ups, and commissions from one place.',
                  style: TextStyle(color: Color(0xFFD8F7FF)),
                ),
              ],
            ),
          ),
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
