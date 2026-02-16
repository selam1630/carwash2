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

  void _loginPhoneOnly() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    final client = ApiClient();
    try {
      final role = await client.loginWithPhoneOnly(phone);
      if (role == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Phone login failed. If this account is not active yet, verify OTP first.')),
        );
        return;
      }
      final roleUpper = role.toUpperCase();
      if (roleUpper == 'WASHER') {
        Navigator.pushReplacementNamed(context, '/washer/requests');
      } else if (roleUpper == 'OWNER') {
        final hasSub = await client.hasActiveSubscription();
        Navigator.pushReplacementNamed(
          context,
          hasSub ? '/request-wash' : '/subscriptions',
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Role $roleUpper is not supported in this mobile UI yet.')),
        );
      }
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Login failed: $err')));
    }
  }

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

  void _goToVerifyWithoutResend() {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter phone number first')),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => OtpVerificationScreen(phone: phone)),
    );
  }

  void _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout and clear stored tokens?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Logout')),
        ],
      ),
    );
    if (confirm != true) return;
    final client = ApiClient();
    await client.logout();
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Logged out')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login'), actions: [
        IconButton(onPressed: _logout, icon: const Icon(Icons.logout))
      ]),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone')),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _loginPhoneOnly, child: const Text('Login')),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: _sendOtp, child: const Text('Send OTP')),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _goToVerifyWithoutResend,
              child: const Text('I already have OTP'),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: () => Navigator.pushNamed(context, '/register'), child: const Text('Register (owner)'))
          ],
        ),
      ),
    );
  }
}
