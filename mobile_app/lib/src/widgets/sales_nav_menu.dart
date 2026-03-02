import 'package:flutter/material.dart';

class SalesNavMenu extends StatelessWidget {
  const SalesNavMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final current = ModalRoute.of(context)?.settings.name;
    return PopupMenuButton<String>(
      icon: const Icon(Icons.apps),
      onSelected: (route) {
        if (route == current) return;
        Navigator.pushReplacementNamed(context, route);
      },
      itemBuilder: (_) => const [
        PopupMenuItem(value: '/sales', child: Text('Dashboard')),
        PopupMenuItem(value: '/sales/register-owner', child: Text('Register Owner')),
        PopupMenuItem(value: '/sales/register-sales', child: Text('Register Sales')),
        PopupMenuItem(value: '/sales/reminders', child: Text('Reminder Leads')),
        PopupMenuItem(value: '/sales/commissions', child: Text('Commissions')),
      ],
    );
  }
}

