import 'package:flutter/material.dart';
import 'otp_verification_screen.dart';
import '../api/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/theme_mode_action.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  bool _restoringSession = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final client = ApiClient();
    try {
      final hasToken = await client.hasStoredAccessToken();
      final role = (await client.getStoredUserRole())?.toUpperCase();
      if (!mounted) return;
      if (!hasToken || role == null || role.isEmpty) {
        setState(() => _restoringSession = false);
        return;
      }

      if (role == 'WASHER') {
        Navigator.pushReplacementNamed(context, '/washer/requests');
        return;
      }
      if (role == 'SALES') {
        Navigator.pushReplacementNamed(context, '/sales');
        return;
      }
      if (role == 'ADMIN') {
        Navigator.pushReplacementNamed(context, '/admin/sales');
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
    } catch (_) {
      // If token is expired or corrupted, stay on login screen.
    }
    if (mounted) {
      setState(() => _restoringSession = false);
    }
  }

  void _loginPhoneOnly() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    final client = ApiClient();
    try {
      final role = await client.loginWithPhoneOnly(phone);
      if (role == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Phone login failed. If this account is not active yet, verify OTP first.')),
        );
        return;
      }
      final roleUpper = role.toUpperCase();
      if (roleUpper == 'WASHER') {
        Navigator.pushReplacementNamed(context, '/washer/requests');
      } else if (roleUpper == 'OWNER') {
        final subStatus = await client.getMySubscriptionStatus();
        final hasSub = subStatus['active'] == true;
        final everSubscribed = subStatus['everSubscribed'] == true;
        Navigator.pushReplacementNamed(
          context,
          hasSub || everSubscribed ? '/request-wash' : '/subscriptions',
        );
      } else if (roleUpper == 'SALES') {
        Navigator.pushReplacementNamed(context, '/sales');
      } else if (roleUpper == 'ADMIN') {
        Navigator.pushReplacementNamed(context, '/admin/sales');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(
                  'Role $roleUpper is not supported in this mobile UI yet.')),
        );
      }
    } catch (err) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Login failed: $err')));
    }
  }

  void _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;
    final client = ApiClient();
    try {
      await client.sendOtp(phone);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('OTP sent')));
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => OtpVerificationScreen(phone: phone)));
    } catch (err) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Error sending OTP: $err')));
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
        content: const Text(
            'Are you sure you want to logout and clear stored tokens?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Logout')),
        ],
      ),
    );
    if (confirm != true) return;
    final client = ApiClient();
    await client.logout();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Logged out')));
  }

  @override
  Widget build(BuildContext context) {
    if (_restoringSession) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Login'),
        actions: [
          const ThemeModeAction(),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? const [Color(0xFF02032E), Color(0xFF052D6F)]
                : const [AppTheme.veryLightBlue, AppTheme.lightCyan],
          ),
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Card(
                elevation: 6,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome Back',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Use your phone number to continue.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 18),
                      TextField(
                        controller: _phoneController,
                        decoration: const InputDecoration(
                          labelText: 'Phone Number',
                          hintText: '+2519XXXXXXXX',
                          prefixIcon: Icon(Icons.phone_iphone),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _loginPhoneOnly,
                          icon: const Icon(Icons.login),
                          label: const Text('Login'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _sendOtp,
                          icon: const Icon(Icons.sms),
                          label: const Text('Send OTP'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton(
                            onPressed: _goToVerifyWithoutResend,
                            child: const Text('I already have OTP'),
                          ),
                          TextButton(
                            onPressed: () =>
                                Navigator.pushNamed(context, '/register'),
                            child: const Text('Register'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
