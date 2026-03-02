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
    final cancellationLeads = _items.where((row) {
      final m = row is Map ? row : const <String, dynamic>{};
      return (m['reminderReason'] ?? '').toString() == 'WASH_REQUEST_CANCELLED';
    }).toList();

    final resubscriptionLeads = _items.where((row) {
      final m = row is Map ? row : const <String, dynamic>{};
      return (m['reminderReason'] ?? '').toString() != 'WASH_REQUEST_CANCELLED';
    }).toList();

    Widget buildLeadCard(dynamic row) {
      final m = row is Map ? row : const <String, dynamic>{};
      final ownerName = (m['ownerFullName'] ?? '-').toString();
      final ownerPhone = (m['ownerPhone'] ?? '-').toString();
      final plan = (m['latestPlanName'] ?? '-').toString();
      final remaining = m['latestRemainingWashes'];
      final expiry = (m['latestExpiresAt'] ?? '-').toString();
      final reason = (m['reminderReason'] ?? '').toString();
      final reasonText = reason == 'WASH_REQUEST_CANCELLED'
          ? 'Customer cancelled wash request. Call and ask why they cancelled.'
          : reason == 'CANCELLED_BY_OWNER'
              ? 'Customer cancelled subscription. Call and ask cancellation reason.'
              : reason == 'PACKAGE_FINISHED'
                  ? 'Package washes finished. Call to remind re-subscription.'
                  : 'Package expired. Call to remind re-subscription.';
      return Card(
        child: ListTile(
          title: Text('$ownerName ($ownerPhone)'),
          subtitle: Text(
            'Call this phone: $ownerPhone\n'
            '$reasonText\n'
            'Plan: $plan, Remaining: ${remaining ?? '-'}\n'
            'Expired/Finished at: $expiry',
          ),
          isThreeLine: true,
        ),
      );
    }

    Widget buildSection({
      required String title,
      required String subtitle,
      required List<dynamic> items,
    }) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(subtitle),
              const SizedBox(height: 8),
              if (items.isEmpty)
                const Text('No items currently.')
              else
                ...items.map(buildLeadCard),
            ],
          ),
        ),
      );
    }

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
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _items.isEmpty
                      ? const Center(child: Text('No reminder leads currently assigned.'))
                      : ListView(
                          children: [
                            buildSection(
                              title: 'Re-subscription Reminders',
                              subtitle: 'Call these customers and remind them to subscribe again.',
                              items: resubscriptionLeads,
                            ),
                            const SizedBox(height: 10),
                            buildSection(
                              title: 'Cancellation Reason Follow-up',
                              subtitle: 'Call these customers and ask why they cancelled the wash request.',
                              items: cancellationLeads,
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
