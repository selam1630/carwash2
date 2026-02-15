import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
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
      // initialize payment (Chapa) and open checkout
      final init = await _client.initializePayment(planId);
      final txRef = init['txRef'] as String?;
      // attempt to extract checkout url from chapa response
      String? checkout;
      try {
        checkout = init['chapa']?['data']?['checkout_url'] as String? ?? init['chapa']?['data']?['url'] as String?;
      } catch (_) {}

      if (checkout != null) {
        final uri = Uri.parse(checkout);
        if (kIsWeb) {
          // open in new tab for web
          await launchUrl(uri, webOnlyWindowName: '_blank');
        } else {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
        // show verify button to confirm payment after redirect
        showDialog(
            context: context,
            builder: (_) {
              return AlertDialog(
                title: const Text('Payment started'),
                content: const Text('Complete the payment in the browser, then tap Verify to finish subscription.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close')),
                  ElevatedButton(
                      onPressed: () async {
                        Navigator.pop(context);
                        setState(() => _loading = true);
                        try {
                          final ver = await _client.verifyPayment(txRef ?? '', planId);
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ver['subscription'] != null ? 'Subscribed' : 'Verification failed')));
                          Navigator.popUntil(context, (route) => route.isFirst);
                        } catch (e) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Verification failed: $e')));
                        } finally {
                          setState(() => _loading = false);
                        }
                      },
                      child: const Text('Verify'))
                ],
              );
            });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payment initiated, please follow the checkout URL.')));
      }
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
