// Use XFile from image_picker so code works on web and mobile
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../api/api_client.dart';
import '../widgets/logout_action.dart';

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _carType = TextEditingController();
  final _plateNumber = TextEditingController();
  final _phone = TextEditingController();
  final _secondaryPhone = TextEditingController();

  XFile? _carFront;
  XFile? _carBack;
  XFile? _driverLicense;

  final ImagePicker _picker = ImagePicker();
  bool _loading = false;

  Future<void> _pick(ImageSource src, String field) async {
    final x = await _picker.pickImage(source: src, imageQuality: 75);
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
    final client = ApiClient();
    try {
      final form = FormData();
      form.fields.add(MapEntry('fullName', _fullName.text.trim()));
      form.fields.add(MapEntry('carType', _carType.text.trim()));
      form.fields.add(MapEntry('plateNumber', _plateNumber.text.trim()));
      form.fields.add(MapEntry('phone', _phone.text.trim()));
      if (_secondaryPhone.text.trim().isNotEmpty)
        form.fields
            .add(MapEntry('secondaryPhone', _secondaryPhone.text.trim()));

      // Use bytes to support web (where dart:io File isn't available)
      Future<MultipartFile> _toMultipart(
          XFile file, String fallbackName) async {
        final bytes = await file.readAsBytes();
        final name = (file.name != null && file.name.isNotEmpty)
            ? file.name
            : fallbackName;
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
        form.files.add(MapEntry('driverLicense',
            await _toMultipart(_driverLicense!, 'driverLicense.jpg')));
      }

      final res = await client.registerOwner(form);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message'] ?? 'Registration submitted')));
      // After registration the backend sends OTP — navigate to OTP screen
      Navigator.pushNamed(
        context,
        '/otp',
        arguments: {
          'phone': _phone.text.trim(),
          'fromRegistration': true,
        },
      );
    } catch (e) {
      String msg = '$e';
      if (e is DioException) {
        try {
          final d = e.response?.data;
          msg = d != null ? d.toString() : e.message ?? e.toString();
        } catch (_) {}
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Registration failed: $msg')));
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register Owner'),
        actions: const [LogoutAction()],
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
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              TextFormField(
                  controller: _carType,
                  decoration: const InputDecoration(labelText: 'Car type'),
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              TextFormField(
                  controller: _plateNumber,
                  decoration: const InputDecoration(labelText: 'Plate number'),
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              TextFormField(
                  controller: _phone,
                  decoration:
                      const InputDecoration(labelText: 'Phone (+2519...)'),
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null),
              TextFormField(
                  controller: _secondaryPhone,
                  decoration: const InputDecoration(
                      labelText: 'Secondary phone (optional)')),
              const SizedBox(height: 12),
              Row(
                children: [
                  ElevatedButton.icon(
                      onPressed: () => _pick(ImageSource.camera, 'carFront'),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Car Front (opt)')),
                  const SizedBox(width: 8),
                  if (_carFront != null) const Text('✓')
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  ElevatedButton.icon(
                      onPressed: () => _pick(ImageSource.camera, 'carBack'),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Car Back (opt)')),
                  const SizedBox(width: 8),
                  if (_carBack != null) const Text('✓')
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  ElevatedButton.icon(
                      onPressed: () =>
                          _pick(ImageSource.camera, 'driverLicense'),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Driver License (opt)')),
                  const SizedBox(width: 8),
                  if (_driverLicense != null) const Text('✓')
                ],
              ),
              const SizedBox(height: 20),
              _loading
                  ? const CircularProgressIndicator()
                  : ElevatedButton(
                      onPressed: _submit,
                      child: const Text('Register & Send OTP'))
            ],
          ),
        ),
      ),
    );
  }
}
