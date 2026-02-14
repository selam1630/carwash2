import 'package:flutter/material.dart';
import 'otp_verification_screen.dart';
import '../api/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();

  void _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    final client = ApiClient();
    try {
      await client.sendOtp(phone);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OTP sent')));
      Navigator.push(context, MaterialPageRoute(builder: (_) => OtpVerificationScreen(phone: phone)));
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error sending OTP: $err')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone')),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _sendOtp, child: const Text('Send OTP')),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.pushNamed(context, '/register'), child: const Text('Register (owner)'))
          ],
        ),
      ),
    );
  }
}
