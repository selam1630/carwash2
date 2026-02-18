import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';

class SalesOwnerRegistrationScreen extends StatefulWidget {
  const SalesOwnerRegistrationScreen({super.key});

  @override
  State<SalesOwnerRegistrationScreen> createState() =>
      _SalesOwnerRegistrationScreenState();
}

class _SalesOwnerRegistrationScreenState
    extends State<SalesOwnerRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _carType = TextEditingController();
  final _plateNumber = TextEditingController();
  final _phone = TextEditingController();
  final _secondaryPhone = TextEditingController();

  final ApiClient _client = ApiClient();
  final ImagePicker _picker = ImagePicker();

  XFile? _carFront;
  XFile? _carBack;
  XFile? _driverLicense;
  bool _loading = false;
  bool _loadingCommissions = false;

  List<dynamic> _commissions = [];
  int _registeredCount = 0;
  double _commissionTotal = 0;

  @override
  void initState() {
    super.initState();
    _loadCommissions();
  }

  Future<void> _pick(String field) async {
    final x =
        await _picker.pickImage(source: ImageSource.camera, imageQuality: 75);
    if (x == null) return;
    setState(() {
      if (field == 'carFront') _carFront = x;
      if (field == 'carBack') _carBack = x;
      if (field == 'driverLicense') _driverLicense = x;
    });
  }

  Future<void> _loadCommissions() async {
    setState(() => _loadingCommissions = true);
    try {
      final rows = await _client.getMySalesCommissions();
      double total = 0;
      for (final row in rows) {
        if (row is Map) {
          final amount = double.tryParse('${row['amount'] ?? 0}') ?? 0;
          total += amount;
        }
      }
      if (!mounted) return;
      setState(() {
        _commissions = rows;
        _registeredCount = rows.length;
        _commissionTotal = total;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load commissions: $e')),
      );
    } finally {
      if (mounted) setState(() => _loadingCommissions = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final form = FormData();
      form.fields.add(MapEntry('fullName', _fullName.text.trim()));
      form.fields.add(MapEntry('carType', _carType.text.trim()));
      form.fields.add(MapEntry('plateNumber', _plateNumber.text.trim()));
      form.fields.add(MapEntry('phone', _phone.text.trim()));
      if (_secondaryPhone.text.trim().isNotEmpty) {
        form.fields
            .add(MapEntry('secondaryPhone', _secondaryPhone.text.trim()));
      }

      Future<MultipartFile> _toMultipart(
          XFile file, String fallbackName) async {
        final bytes = await file.readAsBytes();
        final name = file.name.isNotEmpty ? file.name : fallbackName;
        return MultipartFile.fromBytes(bytes, filename: name);
      }

      if (_carFront != null) {
        form.files.add(MapEntry(
            'carFront', await _toMultipart(_carFront!, 'carFront.jpg')));
      }
      if (_carBack != null) {
        form.files.add(
            MapEntry('carBack', await _toMultipart(_carBack!, 'carBack.jpg')));
      }
      if (_driverLicense != null) {
        form.files.add(MapEntry(
          'driverLicense',
          await _toMultipart(_driverLicense!, 'driverLicense.jpg'),
        ));
      }

      final res = await _client.registerOwnerBySales(form);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                res['message']?.toString() ?? 'Owner registered by sales')),
      );
      _formKey.currentState?.reset();
      _fullName.clear();
      _carType.clear();
      _plateNumber.clear();
      _phone.clear();
      _secondaryPhone.clear();
      setState(() {
        _carFront = null;
        _carBack = null;
        _driverLicense = null;
      });
      await _loadCommissions();
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
        SnackBar(content: Text('Registration failed: $message')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales Owner Registration'),
        actions: [
          IconButton(
            onPressed: _loadingCommissions ? null : _loadCommissions,
            icon: const Icon(Icons.refresh),
          ),
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
                    Text('Registered users: $_registeredCount'),
                    Text('Commission total: $_commissionTotal'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Form(
              key: _formKey,
              child: Column(
                children: [
                  TextFormField(
                    controller: _fullName,
                    decoration: const InputDecoration(labelText: 'Full name'),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                  ),
                  TextFormField(
                    controller: _carType,
                    decoration: const InputDecoration(labelText: 'Car type'),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                  ),
                  TextFormField(
                    controller: _plateNumber,
                    decoration:
                        const InputDecoration(labelText: 'Plate number'),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                  ),
                  TextFormField(
                    controller: _phone,
                    decoration: const InputDecoration(
                        labelText: 'Phone (+2519xxxxxxxx)'),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Required' : null,
                  ),
                  TextFormField(
                    controller: _secondaryPhone,
                    decoration: const InputDecoration(
                        labelText: 'Secondary phone (optional)'),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      ElevatedButton.icon(
                        onPressed: () => _pick('carFront'),
                        icon: const Icon(Icons.camera_alt),
                        label: const Text('Car Front'),
                      ),
                      const SizedBox(width: 8),
                      if (_carFront != null) const Text('✓'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      ElevatedButton.icon(
                        onPressed: () => _pick('carBack'),
                        icon: const Icon(Icons.camera_alt),
                        label: const Text('Car Side'),
                      ),
                      const SizedBox(width: 8),
                      if (_carBack != null) const Text('✓'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      ElevatedButton.icon(
                        onPressed: () => _pick('driverLicense'),
                        icon: const Icon(Icons.camera_alt),
                        label: const Text('Driver License'),
                      ),
                      const SizedBox(width: 8),
                      if (_driverLicense != null) const Text('✓'),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _loading
                      ? const CircularProgressIndicator()
                      : ElevatedButton(
                          onPressed: _submit,
                          child: const Text('Register Owner (Sales)'),
                        ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            const Text('My Commission Records'),
            const SizedBox(height: 8),
            if (_loadingCommissions)
              const Center(child: CircularProgressIndicator())
            else if (_commissions.isEmpty)
              const Text('No commission records yet.')
            else
              ..._commissions.map((row) {
                final m = row is Map ? row : const <String, dynamic>{};
                final ownerProfile = m['ownerProfile'];
                final user = ownerProfile is Map ? ownerProfile['user'] : null;
                final phone = user is Map ? user['phone'] : null;
                return Card(
                  child: ListTile(
                    title: Text('Amount: ${m['amount'] ?? 0}'),
                    subtitle: Text('Owner phone: ${phone ?? '-'}'),
                    trailing: Text((m['status'] ?? '').toString()),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
