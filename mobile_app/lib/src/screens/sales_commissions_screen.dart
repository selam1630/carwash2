import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/logout_action.dart';
import '../widgets/sales_nav_menu.dart';
import '../widgets/theme_mode_action.dart';

class SalesCommissionsScreen extends StatefulWidget {
  const SalesCommissionsScreen({super.key});

  @override
  State<SalesCommissionsScreen> createState() => _SalesCommissionsScreenState();
}

class _SalesCommissionsScreenState extends State<SalesCommissionsScreen> {
  final _client = ApiClient();
  bool _loading = false;
  List<dynamic> _rows = [];
  double _total = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final rows = await _client.getMySalesCommissions();
      double total = 0;
      for (final row in rows) {
        if (row is Map) {
          total += double.tryParse('${row['amount'] ?? 0}') ?? 0;
        }
      }
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _total = total;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load commissions: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Commissions'),
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
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Records: ${_rows.length}'),
                    Text('Total: $_total'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _rows.isEmpty
                      ? const Center(child: Text('No commission records yet.'))
                      : ListView(
                          children: _rows.map((row) {
                            final m = row is Map ? row : const <String, dynamic>{};
                            final ownerProfile = m['ownerProfile'];
                            final user = ownerProfile is Map ? ownerProfile['user'] : null;
                            final ownerPhone = user is Map ? user['phone'] : null;
                            final source = (m['source'] ?? '').toString();
                            return Card(
                              child: ListTile(
                                title: Text('Amount: ${m['amount'] ?? 0}'),
                                subtitle: Text(
                                  'Status: ${m['status'] ?? '-'}\n'
                                  'Source: ${source.isEmpty ? '-' : source}\n'
                                  'Owner phone: ${ownerPhone ?? '-'}',
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

