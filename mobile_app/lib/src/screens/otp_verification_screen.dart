import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
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
      final role =
          (data['user']?['role'] ?? '').toString().trim().toUpperCase();
      final phone = (data['user']?['phone'] ?? widget.phone).toString();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Verified — $phone ($role)')),
      );

      if (role == 'WASHER') {
        Navigator.pushReplacementNamed(context, '/washer/requests');
        return;
      }
      if (role == 'OWNER') {
        final subStatus = await client.getMySubscriptionStatus();
        final hasSub = subStatus['active'] == true;
        final everSubscribed = subStatus['everSubscribed'] == true;
        Navigator.pushReplacementNamed(
          context,
          hasSub || everSubscribed ? '/request-wash' : '/subscriptions',
        );
        return;
      }

      // Don't guess: show the role we received so we can fix data/backend if needed.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Unknown role \"$role\". Staying on this screen.')),
      );
    } catch (err) {
      String msg = '$err';
      if (err is DioException) {
        final data = err.response?.data;
        if (data is Map && data['message'] != null) {
          final message = data['message'];
          msg = message is List ? message.join(', ') : message.toString();
        } else if (data != null) {
          msg = data.toString();
        }
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('OTP verify failed: $msg')));
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
            TextField(
                controller: _otpController,
                decoration: const InputDecoration(labelText: 'OTP')),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _verifyOtp, child: const Text('Verify'))
          ],
        ),
      ),
    );
  }
}
