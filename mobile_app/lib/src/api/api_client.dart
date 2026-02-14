import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  final Dio dio;
  final FlutterSecureStorage storage = const FlutterSecureStorage();

  ApiClient()
      : dio = Dio(BaseOptions(baseUrl: dotenv.env['FLUTTER_API_BASE_URL'] ?? 'http://localhost:3000')) {
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) async {
      final token = await storage.read(key: 'access_token');
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      return handler.next(options);
    }, onError: (e, handler) async {
      if (e.response?.statusCode == 401) {
        // TODO: attempt refresh using refresh token
      }
      return handler.next(e);
    }));
  }

  Future<void> sendOtp(String phone) async {
    final resp = await dio.post('/auth/send-otp', data: {'phone': phone});
    return resp.data;
  }

  /// Verify OTP and store tokens (access + refresh) in secure storage
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final resp = await dio.post('/auth/verify-otp', data: {'phone': phone, 'otp': otp});
    final data = resp.data as Map<String, dynamic>;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (access != null && refresh != null) {
      await storage.write(key: 'access_token', value: access);
      await storage.write(key: 'refresh_token', value: refresh);
    }
    return data;
  }
}
