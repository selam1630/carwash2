import 'package:flutter/material.dart';
import '../api/api_client.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final ApiClient _client = ApiClient();
  bool _loading = true;
  List<dynamic> _plans = [];

  @override
  void initState() {
    super.initState();
    _loadPlans();
  }

  Future<void> _loadPlans() async {
    setState(() => _loading = true);
    try {
      final plans = await _client.getPlans();
      setState(() => _plans = plans);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load plans: $e')));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _subscribe(String planId) async {
    setState(() => _loading = true);
    try {
      final res = await _client.subscribe(planId);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['message'] ?? 'Subscribed')));
      // after subscribing, go back to home
      Navigator.popUntil(context, (route) => route.isFirst);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Subscription failed: $e')));
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Choose a Subscription')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadPlans,
              child: ListView.builder(
                itemCount: _plans.length,
                itemBuilder: (ctx, i) {
                  final p = _plans[i] as Map<String, dynamic>;
                  final washes = p['washesPerMonth'] as int? ?? 0;
                  final isUnlimited = washes >= 9999;
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: ListTile(
                      title: Text(p['name'] ?? 'Plan'),
                      subtitle: Text(isUnlimited ? 'Unlimited washes' : '${washes} washes / month'),
                      trailing: ElevatedButton(
                        onPressed: () => _subscribe(p['id'] as String),
                        child: Text('Buy ${p['price'] ?? ''}'),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
