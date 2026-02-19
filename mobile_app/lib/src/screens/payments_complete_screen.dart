import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../widgets/logout_action.dart';

class PaymentsCompleteScreen extends StatefulWidget {
  final String txRef;
  final String planId;
  const PaymentsCompleteScreen(
      {super.key, required this.txRef, required this.planId});

  @override
  State<PaymentsCompleteScreen> createState() => _PaymentsCompleteScreenState();
}

class _PaymentsCompleteScreenState extends State<PaymentsCompleteScreen> {
  final ApiClient _client = ApiClient();
  bool _loading = true;
  String _message = 'Verifying payment...';

  @override
  void initState() {
    super.initState();
    _verify();
  }

  Future<void> _verify() async {
    setState(() {
      _loading = true;
      _message = 'Verifying payment...';
    });
    try {
      final res = await _client.verifyPayment(widget.txRef, widget.planId);
      final ok = res['subscription'] != null;
      setState(() {
        _message = ok ? 'Subscription active' : 'Verification failed';
      });
      if (ok && mounted) {
        Navigator.pushReplacementNamed(context, '/request-wash');
      }
    } catch (e) {
      setState(() {
        _message = 'Verification error: $e';
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Status'),
        actions: const [LogoutAction()],
      ),
      body: Center(
        child: _loading
            ? const CircularProgressIndicator()
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_message),
                  const SizedBox(height: 12),
                  ElevatedButton(
                      onPressed: () =>
                          Navigator.popUntil(context, (r) => r.isFirst),
                      child: const Text('Done'))
                ],
              ),
      ),
    );
  }
}
