import 'dart:io';
import 'package:dio/dio.dart';

Future<void> main() async {
  final base = Platform.environment['FLUTTER_API_BASE_URL'] ?? 'http://localhost:3000';
  final dio = Dio(BaseOptions(baseUrl: base));

  stdout.write('Phone (Ethiopia format +2519xxxxxxxx): ');
  final phone = stdin.readLineSync()!.trim();
  try {
    final resp = await dio.post('/auth/send-otp', data: {'phone': phone});
    print('send-otp response: ${resp.data}');
  } catch (e) {
    print('send-otp failed: $e');
    return;
  }

  stdout.write('Enter OTP shown in backend logs: ');
  final otp = stdin.readLineSync()!.trim();
  try {
    final resp = await dio.post('/auth/verify-otp', data: {'phone': phone, 'otp': otp});
    print('verify response: ${resp.data}');
  } catch (e) {
    print('verify failed: $e');
  }
}
