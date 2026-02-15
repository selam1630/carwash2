import 'package:flutter/material.dart';
import '../api/api_client.dart';

class OtpVerificationScreen extends StatefulWidget {
  final String phone;
  const OtpVerificationScreen({super.key, required this.phone});

  @override
  State<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends State<OtpVerificationScreen> {
  final _otpController = TextEditingController();

  void _verifyOtp() async {
    final otp = _otpController.text.trim();
    if (otp.isEmpty) return;
    final client = ApiClient();
    try {
      final data = await client.verifyOtp(widget.phone, otp);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Verified — welcome ${data['user']?['phone'] ?? ''}')));
      // Navigate to subscription selection after verification
      Navigator.pushReplacementNamed(context, '/subscriptions');
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('OTP verify failed: $err')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Verify ${widget.phone}')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(controller: _otpController, decoration: const InputDecoration(labelText: 'OTP')),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _verifyOtp, child: const Text('Verify'))
          ],
        ),
      ),
    );
  }
}
