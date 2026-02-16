import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/device_service.dart';

class ApiClient {
  final Dio dio;
  final FlutterSecureStorage storage = const FlutterSecureStorage();

  ApiClient()
      : dio = Dio(BaseOptions(baseUrl: dotenv.env['FLUTTER_API_BASE_URL'] ?? 'http://localhost:3000')) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (e, handler) async {
        final status = e.response?.statusCode;
        final path = e.requestOptions.path;
        if (status == 401 && !path.contains('/auth/refresh') && !path.contains('/auth/verify-otp')) {
          try {
            final retried = await _handle401AndRefresh(e);
            if (retried != null) return handler.resolve(retried);
          } catch (_) {
          }
        }
        return handler.next(e);
      },
    ));
  }
  final DeviceService _device = DeviceService();
  bool _refreshing = false;
  final List<Completer<void>> _refreshWaiters = [];

  Future<void> sendOtp(String phone) async {
    final resp = await dio.post('/auth/send-otp', data: {'phone': phone});
    return resp.data;
  }

  /// Verify OTP and store tokens (access + refresh) in secure storage
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final deviceId = await _device.getDeviceId();
    final resp = await dio.post('/auth/verify-otp', data: {'phone': phone, 'otp': otp, 'deviceId': deviceId});
    final data = resp.data as Map<String, dynamic>;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    final user = data['user'] as Map<String, dynamic>?;
    final userPhone = user?['phone']?.toString();
    final userRole = user?['role']?.toString();
    if (access != null && refresh != null) {
      await storage.write(key: 'access_token', value: access);
      await storage.write(key: 'refresh_token', value: refresh);
      await storage.write(key: 'device_id', value: deviceId);
      if (userPhone != null && userPhone.isNotEmpty) {
        await storage.write(key: 'user_phone', value: userPhone);
      }
      if (userRole != null && userRole.isNotEmpty) {
        await storage.write(key: 'user_role', value: userRole);
      }
    }
    return data;
  }

  Future<Map<String, dynamic>> refreshWithDevice(String refreshToken) async {
    final deviceId = await _device.getDeviceId();
    // Use a separate Dio instance to avoid interceptor recursion
    final authDio = Dio(BaseOptions(baseUrl: dio.options.baseUrl));
    final resp = await authDio.post('/auth/refresh', data: {'refreshToken': refreshToken, 'deviceId': deviceId});
    final data = resp.data as Map<String, dynamic>;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (access != null && refresh != null) {
      await storage.write(key: 'access_token', value: access);
      await storage.write(key: 'refresh_token', value: refresh);
    }
    return data;
  }

  Future<void> logout() async {
    await storage.delete(key: 'access_token');
    await storage.delete(key: 'refresh_token');
    await storage.delete(key: 'device_id');
    await storage.delete(key: 'user_phone');
    await storage.delete(key: 'user_role');
  }

  /// For already-verified users on the same phone: refresh session without OTP.
  /// Requires the stored refresh token + matching phone.
  Future<String?> loginWithPhoneOnly(String phone) async {
    final savedPhone = await storage.read(key: 'user_phone');
    final refreshToken = await storage.read(key: 'refresh_token');
    if (savedPhone == null || refreshToken == null) return null;
    if (savedPhone.trim() != phone.trim()) return null;

    await refreshWithDevice(refreshToken);
    return await storage.read(key: 'user_role');
  }

  Future<Response<dynamic>?> _handle401AndRefresh(DioError error) async {
    // If a refresh is already in progress, wait for it to finish
    if (_refreshing) {
      final c = Completer<void>();
      _refreshWaiters.add(c);
      await c.future;
      // after refresh, retry the original request if access token exists
      final access = await storage.read(key: 'access_token');
      if (access == null) return null;
      error.requestOptions.headers['Authorization'] = 'Bearer $access';
      return dio.fetch(error.requestOptions);
    }

    _refreshing = true;
    try {
      final refreshToken = await storage.read(key: 'refresh_token');
      if (refreshToken == null) return null;
      final data = await refreshWithDevice(refreshToken);
      final access = data['accessToken'] as String?;
      if (access == null) return null;
      // retry original request with new access token
      error.requestOptions.headers['Authorization'] = 'Bearer $access';
      final resp = await dio.fetch(error.requestOptions);
      return resp;
    } catch (e) {
      await logout();
      rethrow;
    } finally {
      _refreshing = false;
      for (final c in _refreshWaiters) {
        if (!c.isCompleted) c.complete();
      }
      _refreshWaiters.clear();
    }
  }

  /// Register owner (multipart/form-data). Expects form fields and files.
  Future<dynamic> registerOwner(FormData form) async {
    final resp = await dio.post('/auth/register-owner', data: form);
    return resp.data;
  }

  /// Get available plans
  Future<List<dynamic>> getPlans() async {
    final resp = await dio.get('/plans');
    return resp.data as List<dynamic>;
  }

  /// Subscribe current authenticated owner to a plan
  Future<dynamic> subscribe(String planId) async {
    final resp = await dio.post('/subscriptions/subscribe/$planId');
    return resp.data;
  }

  /// Initialize Chapa payment for a plan; returns chapa initialization data
  Future<Map<String, dynamic>> initializePayment(String planId) async {
    final resp = await dio.post('/payments/initialize/$planId');
    return resp.data as Map<String, dynamic>;
  }

  /// Verify chapa tx_ref after redirect
  Future<Map<String, dynamic>> verifyPayment(String txRef, String planId) async {
    final cleanTxRef = txRef.trim();
    final cleanPlanId = planId.trim();
    if (cleanTxRef.isEmpty || cleanPlanId.isEmpty) {
      throw ArgumentError('txRef and planId are required for payment verification');
    }
    final resp = await dio.get('/payments/verify', queryParameters: {'tx_ref': cleanTxRef, 'planId': cleanPlanId});
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createWashRequest({
    required double pickupLat,
    required double pickupLng,
  }) async {
    final resp = await dio.post(
      '/wash/requests',
      data: {'pickupLat': pickupLat, 'pickupLng': pickupLng},
    );
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>?> getActiveWashRequest() async {
    final resp = await dio.get('/wash/requests/active');
    if (resp.data == null) return null;
    return resp.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> acceptWashRequest(String requestId) async {
    final resp = await dio.post('/wash/requests/$requestId/accept');
    return resp.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> listOpenWashRequests() async {
    final resp = await dio.get('/wash/requests/open');
    return resp.data as List<dynamic>;
  }

  Future<void> updateWasherPresence({
    required double lat,
    required double lng,
    bool online = true,
  }) async {
    await dio.post('/wash/washers/presence', data: {'lat': lat, 'lng': lng, 'online': online});
  }

  Future<List<dynamic>> getNearbyWashers({
    required double lat,
    required double lng,
    double radiusKm = 3,
  }) async {
    final resp = await dio.get('/wash/washers/nearby', queryParameters: {'lat': lat, 'lng': lng, 'radiusKm': radiusKm});
    return resp.data as List<dynamic>;
  }

  Future<void> updateWasherLocation({
    required String requestId,
    required double lat,
    required double lng,
    double? heading,
    double? speed,
  }) async {
    await dio.post(
      '/wash/requests/$requestId/location',
      data: {
        'lat': lat,
        'lng': lng,
        if (heading != null) 'heading': heading,
        if (speed != null) 'speed': speed,
      },
    );
  }
}
