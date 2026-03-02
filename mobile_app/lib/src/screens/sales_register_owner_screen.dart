import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../widgets/logout_action.dart';
import '../widgets/sales_nav_menu.dart';
import '../widgets/theme_mode_action.dart';

class SalesRegisterOwnerScreen extends StatefulWidget {
  const SalesRegisterOwnerScreen({super.key});

  @override
  State<SalesRegisterOwnerScreen> createState() => _SalesRegisterOwnerScreenState();
}

class _SalesRegisterOwnerScreenState extends State<SalesRegisterOwnerScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _carType = TextEditingController();
  final _plateNumber = TextEditingController();
  final _phone = TextEditingController();
  final _secondaryPhone = TextEditingController();

  final _client = ApiClient();
  final _picker = ImagePicker();

  XFile? _carFront;
  XFile? _carBack;
  XFile? _driverLicense;
  bool _loading = false;

  @override
  void dispose() {
    _fullName.dispose();
    _carType.dispose();
    _plateNumber.dispose();
    _phone.dispose();
    _secondaryPhone.dispose();
    super.dispose();
  }

  Future<void> _pick(String field) async {
    final x = await _picker.pickImage(source: ImageSource.camera, imageQuality: 75);
    if (x == null) return;
    setState(() {
      if (field == 'carFront') _carFront = x;
      if (field == 'carBack') _carBack = x;
      if (field == 'driverLicense') _driverLicense = x;
    });
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
        form.fields.add(MapEntry('secondaryPhone', _secondaryPhone.text.trim()));
      }

      Future<MultipartFile> toMultipart(XFile file, String fallbackName) async {
        final bytes = await file.readAsBytes();
        final name = file.name.isNotEmpty ? file.name : fallbackName;
        return MultipartFile.fromBytes(bytes, filename: name);
      }

      if (_carFront != null) {
        form.files.add(MapEntry('carFront', await toMultipart(_carFront!, 'carFront.jpg')));
      }
      if (_carBack != null) {
        form.files.add(MapEntry('carBack', await toMultipart(_carBack!, 'carBack.jpg')));
      }
      if (_driverLicense != null) {
        form.files.add(MapEntry('driverLicense', await toMultipart(_driverLicense!, 'driverLicense.jpg')));
      }

      final res = await _client.registerOwnerBySales(form);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['message']?.toString() ?? 'Owner registered')),
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
        title: const Text('Register Owner'),
        actions: const [SalesNavMenu(), ThemeModeAction(), LogoutAction()],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _fullName,
                decoration: const InputDecoration(labelText: 'Full name'),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              TextFormField(
                controller: _carType,
                decoration: const InputDecoration(labelText: 'Car type'),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              TextFormField(
                controller: _plateNumber,
                decoration: const InputDecoration(labelText: 'Plate number'),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              TextFormField(
                controller: _phone,
                decoration: const InputDecoration(labelText: 'Phone (+2519xxxxxxxx)'),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              TextFormField(
                controller: _secondaryPhone,
                decoration: const InputDecoration(labelText: 'Secondary phone (optional)'),
              ),
              const SizedBox(height: 12),
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
              const SizedBox(height: 16),
              _loading
                  ? const CircularProgressIndicator()
                  : ElevatedButton(
                      onPressed: _submit,
                      child: const Text('Register Owner'),
                    ),
            ],
          ),
        ),
      ),
    );
  }
}

