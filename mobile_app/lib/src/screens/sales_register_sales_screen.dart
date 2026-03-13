import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/logout_action.dart';
import '../widgets/sales_nav_menu.dart';
import '../widgets/theme_mode_action.dart';

class SalesRegisterSalesScreen extends StatefulWidget {
  const SalesRegisterSalesScreen({super.key});

  @override
  State<SalesRegisterSalesScreen> createState() =>
      _SalesRegisterSalesScreenState();
}

class _SalesRegisterSalesScreenState extends State<SalesRegisterSalesScreen> {
  final _phone = TextEditingController();
  final _fullName = TextEditingController();
  final _nationalId = TextEditingController();
  final _sponsorNationalId = TextEditingController();
  final _bankName = TextEditingController();
  final _bankAccount = TextEditingController();
  final _bankAccountName = TextEditingController();

  final _client = ApiClient();
  bool _loading = false;

  @override
  void dispose() {
    _phone.dispose();
    _fullName.dispose();
    _nationalId.dispose();
    _sponsorNationalId.dispose();
    _bankName.dispose();
    _bankAccount.dispose();
    _bankAccountName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phone.text.trim();
    final fullName = _fullName.text.trim();
    final nationalId = _nationalId.text.trim();
    final sponsorNationalId = _sponsorNationalId.text.trim();
    final bankName = _bankName.text.trim();
    final bankAccount = _bankAccount.text.trim();
    final bankAccountName = _bankAccountName.text.trim();

    if (phone.isEmpty ||
        fullName.isEmpty ||
        nationalId.isEmpty ||
        sponsorNationalId.isEmpty ||
        bankName.isEmpty ||
        bankAccount.isEmpty ||
        bankAccountName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill all fields')),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final res = await _client.registerSalesBySales(
        phone: phone,
        fullName: fullName,
        nationalId: nationalId,
        sponsorNationalId: sponsorNationalId,
        bankDetails: {
          'bankName': bankName,
          'accountNumber': bankAccount,
          'accountName': bankAccountName,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(res['message']?.toString() ?? 'Sales registered')),
      );
      _phone.clear();
      _fullName.clear();
      _nationalId.clear();
      _sponsorNationalId.clear();
      _bankName.clear();
      _bankAccount.clear();
      _bankAccountName.clear();
    } catch (e) {
      String message = '$e';
      if (e is DioException) {
        final data = e.response?.data;
        if (data is Map && data['message'] != null) {
          final m = data['message'];
          message = m is List ? m.join(', ') : m.toString();
        } else if (data != null) {
          message = data.toString();
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sales registration failed: $message')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register Sales'),
        actions: const [SalesNavMenu(), ThemeModeAction(), LogoutAction()],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Card(
          elevation: 3,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sales Onboarding',
                  style: TextStyle(
                    color: AppTheme.navyBlue,
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Register a new sales partner with identity and bank details.',
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _phone,
                  decoration: const InputDecoration(
                      labelText: 'Sales phone (+2519XXXXXXXX)'),
                ),
                TextField(
                  controller: _fullName,
                  decoration:
                      const InputDecoration(labelText: 'Sales full name'),
                ),
                TextField(
                  controller: _nationalId,
                  decoration:
                      const InputDecoration(labelText: 'Sales national ID'),
                ),
                TextField(
                  controller: _sponsorNationalId,
                  decoration:
                      const InputDecoration(labelText: 'Sponsor national ID'),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Bank Details',
                  style: TextStyle(
                    color: AppTheme.deepBlue,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _bankName,
                  decoration: const InputDecoration(labelText: 'Bank name'),
                ),
                TextField(
                  controller: _bankAccount,
                  decoration:
                      const InputDecoration(labelText: 'Bank account number'),
                ),
                TextField(
                  controller: _bankAccountName,
                  decoration:
                      const InputDecoration(labelText: 'Bank account name'),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : ElevatedButton.icon(
                          onPressed: _submit,
                          icon: const Icon(Icons.group_add),
                          label: const Text('Register Sales'),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
