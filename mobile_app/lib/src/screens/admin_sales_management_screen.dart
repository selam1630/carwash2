import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/logout_action.dart';
import '../widgets/theme_mode_action.dart';

class AdminSalesManagementScreen extends StatefulWidget {
  const AdminSalesManagementScreen({super.key});

  @override
  State<AdminSalesManagementScreen> createState() =>
      _AdminSalesManagementScreenState();
}

class _AdminSalesManagementScreenState extends State<AdminSalesManagementScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _fullName = TextEditingController();
  final _nationalId = TextEditingController();
  final _sponsorNationalId = TextEditingController();
  final _bankName = TextEditingController();
  final _bankAccount = TextEditingController();
  final _bankAccountName = TextEditingController();
  final _yearController = TextEditingController();
  final _monthController = TextEditingController();

  final _client = ApiClient();
  bool _submitting = false;
  bool _loadingTree = false;
  bool _loadingCommissions = false;
  String? _treeLoadError;
  String? _commissionLoadError;
  List<dynamic> _roots = const [];
  List<dynamic> _commissionItems = const [];
  int _totalSales = 0;
  int _rootCount = 0;
  int _maxDepth = 0;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _yearController.text = now.year.toString();
    _monthController.text = now.month.toString();
    _loadAll();
  }

  @override
  void dispose() {
    _phone.dispose();
    _fullName.dispose();
    _nationalId.dispose();
    _sponsorNationalId.dispose();
    _bankName.dispose();
    _bankAccount.dispose();
    _bankAccountName.dispose();
    _yearController.dispose();
    _monthController.dispose();
    super.dispose();
  }

  String _extractError(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        final m = data['message'];
        return m is List ? m.join(', ') : m.toString();
      }
      if (data != null) return data.toString();
      return e.message ?? e.toString();
    }
    return e.toString();
  }

  Future<void> _registerSales() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final res = await _client.registerSalesByAdmin(
        phone: _phone.text,
        fullName: _fullName.text,
        nationalId: _nationalId.text,
        sponsorNationalId: _sponsorNationalId.text,
        bankDetails: {
          'bankName': _bankName.text.trim(),
          'accountNumber': _bankAccount.text.trim(),
          'accountName': _bankAccountName.text.trim(),
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'Sales registered'),
        ),
      );
      _formKey.currentState?.reset();
      _phone.clear();
      _fullName.clear();
      _nationalId.clear();
      _sponsorNationalId.clear();
      _bankName.clear();
      _bankAccount.clear();
      _bankAccountName.clear();
      await _loadTree();
    } catch (e) {
      if (!mounted) return;
      final message = _extractError(e);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Registration failed: $message')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _loadTree() async {
    setState(() => _loadingTree = true);
    try {
      final res = await _client.getAdminSalesTree();
      if (!mounted) return;
      setState(() {
        _treeLoadError = null;
        _roots = (res['roots'] as List?) ?? const [];
        _totalSales = (res['totalSales'] as num?)?.toInt() ?? 0;
        _rootCount = (res['rootCount'] as num?)?.toInt() ?? 0;
        _maxDepth = (res['maxDepth'] as num?)?.toInt() ?? 0;
      });
    } catch (e) {
      if (!mounted) return;
      final msg = _extractError(e);
      setState(() => _treeLoadError = msg);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed to load tree: $msg')));
    } finally {
      if (mounted) setState(() => _loadingTree = false);
    }
  }

  Future<void> _loadCommissions() async {
    final year = int.tryParse(_yearController.text.trim());
    final month = int.tryParse(_monthController.text.trim());
    if (year == null || month == null || month < 1 || month > 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter valid year and month (1-12).')),
      );
      return;
    }

    setState(() => _loadingCommissions = true);
    try {
      final res = await _client.getAdminSalesMonthlyCommissions(
        year: year,
        month: month,
      );
      if (!mounted) return;
      setState(() {
        _commissionLoadError = null;
        _commissionItems = (res['items'] as List?) ?? const [];
      });
    } catch (e) {
      if (!mounted) return;
      final msg = _extractError(e);
      setState(() => _commissionLoadError = msg);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load commissions: $msg')),
      );
    } finally {
      if (mounted) setState(() => _loadingCommissions = false);
    }
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadTree(), _loadCommissions()]);
  }

  Future<void> _approve(dynamic row) async {
    if (row is! Map) return;
    final salesUserId = (row['salesUserId'] ?? '').toString();
    if (salesUserId.isEmpty) return;
    final year = int.tryParse(_yearController.text.trim());
    final month = int.tryParse(_monthController.text.trim());
    if (year == null || month == null) return;

    try {
      final res = await _client.approveAdminSalesMonthlyCommissions(
        salesUserId: salesUserId,
        year: year,
        month: month,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Approved')),
      );
      await _loadCommissions();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approval failed: ${_extractError(e)}')),
      );
    }
  }

  List<Widget> _buildTree(dynamic node, int level) {
    if (node is! Map) return const [];
    final fullName = (node['fullName'] ?? '-').toString();
    final phone = (node['phone'] ?? '-').toString();
    final salesProfileId = (node['salesProfileId'] ?? '').toString();
    final totalCommissionAmount =
        (node['totalCommissionAmount'] as num?)?.toDouble() ?? 0;
    final pendingCommissionAmount =
        (node['pendingCommissionAmount'] as num?)?.toDouble() ?? 0;
    final paidCommissionAmount =
        (node['paidCommissionAmount'] as num?)?.toDouble() ?? 0;
    final ownerRegistrationCommissionCount =
        (node['ownerRegistrationCommissionCount'] as num?)?.toInt() ?? 0;
    final salesRecruitmentCommissionCount =
        (node['salesRecruitmentCommissionCount'] as num?)?.toInt() ?? 0;
    final children = (node['children'] as List?) ?? const [];
    final widgets = <Widget>[
      Padding(
        padding: EdgeInsets.only(left: level * 14.0, top: 4, bottom: 4),
        child: Card(
          margin: EdgeInsets.zero,
          child: ListTile(
            dense: true,
            title: Text(fullName),
            subtitle: Text(
              '$phone\nTotal: $totalCommissionAmount, Pending: $pendingCommissionAmount, Paid: $paidCommissionAmount\nOwner refs: $ownerRegistrationCommissionCount, Sales refs: $salesRecruitmentCommissionCount',
            ),
            isThreeLine: true,
            trailing: Text(
              salesProfileId.length > 8
                  ? salesProfileId.substring(0, 8)
                  : salesProfileId,
            ),
          ),
        ),
      ),
    ];
    for (final child in children) {
      widgets.addAll(_buildTree(child, level + 1));
    }
    return widgets;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Sales Management'),
        actions: [
          IconButton(
            onPressed: (_loadingTree || _loadingCommissions) ? null : _loadAll,
            icon: const Icon(Icons.refresh),
          ),
          const ThemeModeAction(),
          const LogoutAction(),
        ],
      ),
      body: SingleChildScrollView(
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
                    Text('Total sales: $_totalSales'),
                    Text('Roots: $_rootCount'),
                    Text('Depth: $_maxDepth'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Register Sales'),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone (+2519XXXXXXXX)',
                        ),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _fullName,
                        decoration:
                            const InputDecoration(labelText: 'Full name'),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _nationalId,
                        decoration:
                            const InputDecoration(labelText: 'National ID'),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _sponsorNationalId,
                        decoration: const InputDecoration(
                          labelText: 'Sponsor National ID',
                        ),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _bankName,
                        decoration:
                            const InputDecoration(labelText: 'Bank name'),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _bankAccount,
                        decoration: const InputDecoration(
                          labelText: 'Bank account number',
                        ),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      TextFormField(
                        controller: _bankAccountName,
                        decoration: const InputDecoration(
                          labelText: 'Bank account name',
                        ),
                        validator: (v) =>
                            v == null || v.trim().isEmpty ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      _submitting
                          ? const Center(child: CircularProgressIndicator())
                          : ElevatedButton(
                              onPressed: _registerSales,
                              child: const Text('Register Sales'),
                            ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Monthly Sales Commissions'),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _yearController,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Year'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _monthController,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Month'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton(
                          onPressed:
                              _loadingCommissions ? null : _loadCommissions,
                          child: const Text('Load'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (_loadingCommissions)
                      const Center(child: CircularProgressIndicator())
                    else if (_commissionLoadError != null)
                      Text(
                        'Load error: $_commissionLoadError',
                        style: const TextStyle(color: Colors.red),
                      )
                    else if (_commissionItems.isEmpty)
                      const Text('No commission rows for selected month.')
                    else
                      ..._commissionItems.map((row) {
                        final m = row is Map ? row : const {};
                        final salesName = (m['salesFullName'] ?? '-').toString();
                        final salesPhone = (m['salesPhone'] ?? '-').toString();
                        final pendingAmount = m['pendingAmount'] ?? 0;
                        final paidAmount = m['paidAmount'] ?? 0;
                        final pendingCount = m['pendingCount'] ?? 0;
                        final paidCount = m['paidCount'] ?? 0;
                        return Card(
                          child: ListTile(
                            title: Text('$salesName ($salesPhone)'),
                            subtitle: Text(
                              'Pending: $pendingCount / $pendingAmount, Paid: $paidCount / $paidAmount',
                            ),
                            trailing: ElevatedButton(
                              onPressed: () => _approve(row),
                              child: const Text('Approve'),
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Sales Tree'),
            const SizedBox(height: 8),
            if (_loadingTree)
              const Center(child: CircularProgressIndicator())
            else if (_treeLoadError != null)
              Text(
                'Load error: $_treeLoadError',
                style: const TextStyle(color: Colors.red),
              )
            else if (_roots.isEmpty)
              const Text('No sales tree records yet.')
            else
              ..._roots.expand((node) => _buildTree(node, 0)),
          ],
        ),
      ),
    );
  }
}
