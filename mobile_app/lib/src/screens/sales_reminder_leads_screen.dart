import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/logout_action.dart';
import '../widgets/sales_nav_menu.dart';
import '../widgets/theme_mode_action.dart';

class SalesReminderLeadsScreen extends StatefulWidget {
  const SalesReminderLeadsScreen({super.key});

  @override
  State<SalesReminderLeadsScreen> createState() => _SalesReminderLeadsScreenState();
}

class _SalesReminderLeadsScreenState extends State<SalesReminderLeadsScreen> {
  final _client = ApiClient();
  bool _loading = false;
  List<dynamic> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await _client.getSalesReminderLeads();
      final items = (res['items'] as List?) ?? const [];
      if (!mounted) return;
      setState(() => _items = items);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load reminder leads: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Re-subscription Reminders'),
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
          const SalesNavMenu(),
          const ThemeModeAction(),
          const LogoutAction(),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Please call each listed customer and remind them to subscribe again.'),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _items.isEmpty
                      ? const Center(child: Text('No reminder leads currently assigned.'))
                      : ListView(
                          children: _items.map((row) {
                            final m = row is Map ? row : const <String, dynamic>{};
                            final ownerName = (m['ownerFullName'] ?? '-').toString();
                            final ownerPhone = (m['ownerPhone'] ?? '-').toString();
                            final plan = (m['latestPlanName'] ?? '-').toString();
                            final remaining = m['latestRemainingWashes'];
                            final expiry = (m['latestExpiresAt'] ?? '-').toString();
                            return Card(
                              child: ListTile(
                                title: Text('$ownerName ($ownerPhone)'),
                                subtitle: Text(
                                  'Call this phone for re-subscription reminder: $ownerPhone\n'
                                  'Plan: $plan, Remaining: ${remaining ?? '-'}\n'
                                  'Expired/Finished at: $expiry',
                                ),
                                isThreeLine: true,
                              ),
                            );
                          }).toList(),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

