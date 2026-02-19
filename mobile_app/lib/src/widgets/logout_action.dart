import 'package:flutter/material.dart';

import '../api/api_client.dart';

class LogoutAction extends StatelessWidget {
  const LogoutAction({super.key});

  Future<void> _logout(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    await ApiClient().logout();
    if (!context.mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Logout',
      onPressed: () => _logout(context),
      icon: const Icon(Icons.logout),
    );
  }
}
