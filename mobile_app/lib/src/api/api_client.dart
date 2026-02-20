import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import '../services/device_service.dart';
import '../services/session_kv.dart';

class ApiClient {
  final Dio dio;
  final FlutterSecureStorage storage = const FlutterSecureStorage();
  static String? _accessTokenMem;
  static String? _refreshTokenMem;
  static String? _userPhoneMem;
  static String? _userRoleMem;

  ApiClient()
      : dio = Dio(BaseOptions(
            baseUrl: dotenv.env['FLUTTER_API_BASE_URL'] ??
                'http://localhost:3000')) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        var token = _accessTokenMem;
        if (token == null || token.isEmpty) {
          token = await _readAuthKey('access_token');
          if (token != null && token.isNotEmpty) {
            _accessTokenMem = token;
          }
        }
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (e, handler) async {
        final status = e.response?.statusCode;
        final path = e.requestOptions.path;
        if (status == 401 &&
            !path.contains('/auth/refresh') &&
            !path.contains('/auth/verify-otp') &&
            !path.contains('/auth/phone-login')) {
          try {
            final retried = await _handle401AndRefresh(e);
            if (retried != null) return handler.resolve(retried);
          } catch (_) {}
        }
        return handler.next(e);
      },
    ));
  }
  final DeviceService _device = DeviceService();
  bool _refreshing = false;
  final List<Completer<void>> _refreshWaiters = [];

  Future<String?> _readAuthKey(String key) async {
    if (isSessionKvAvailable) {
      return sessionRead(key);
    }
    try {
      return await storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeAuthKey(String key, String value) async {
    if (isSessionKvAvailable) {
      sessionWrite(key, value);
      return;
    }
    await storage.write(key: key, value: value);
  }

  Future<void> _deleteAuthKey(String key) async {
    if (isSessionKvAvailable) {
      sessionDelete(key);
    }
    try {
      await storage.delete(key: key);
    } catch (_) {}
  }

  Future<void> sendOtp(String phone) async {
    final resp = await dio.post('/auth/send-otp', data: {'phone': phone});
    return resp.data;
  }

  /// Verify OTP and store tokens (access + refresh) in secure storage
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final deviceId = await _device.getDeviceId();
    final resp = await dio.post('/auth/verify-otp',
        data: {'phone': phone, 'otp': otp, 'deviceId': deviceId});
    final data = resp.data as Map<String, dynamic>;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    final user = data['user'] as Map<String, dynamic>?;
    final userPhone = user?['phone']?.toString();
    final userRole = user?['role']?.toString();
    if (access != null && refresh != null) {
      _accessTokenMem = access;
      _refreshTokenMem = refresh;
      await _writeAuthKey('access_token', access);
      await _writeAuthKey('refresh_token', refresh);
      await _writeAuthKey('device_id', deviceId);
      if (userPhone != null && userPhone.isNotEmpty) {
        _userPhoneMem = userPhone;
        await _writeAuthKey('user_phone', userPhone);
      }
      if (userRole != null && userRole.isNotEmpty) {
        _userRoleMem = userRole;
        await _writeAuthKey('user_role', userRole);
      }
    }
    return data;
  }

  Future<Map<String, dynamic>> refreshWithDevice(String refreshToken) async {
    final deviceId = await _device.getDeviceId();
    // Use a separate Dio instance to avoid interceptor recursion
    final authDio = Dio(BaseOptions(baseUrl: dio.options.baseUrl));
    final resp = await authDio.post('/auth/refresh',
        data: {'refreshToken': refreshToken, 'deviceId': deviceId});
    final data = resp.data as Map<String, dynamic>;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (access != null && refresh != null) {
      _accessTokenMem = access;
      _refreshTokenMem = refresh;
      await _writeAuthKey('access_token', access);
      await _writeAuthKey('refresh_token', refresh);
    }
    return data;
  }

  Future<void> logout() async {
    _accessTokenMem = null;
    _refreshTokenMem = null;
    _userPhoneMem = null;
    _userRoleMem = null;
    await _deleteAuthKey('access_token');
    await _deleteAuthKey('refresh_token');
    await _deleteAuthKey('device_id');
    await _deleteAuthKey('user_phone');
    await _deleteAuthKey('user_role');
  }

  Future<String?> getStoredUserRole() async {
    var role = _userRoleMem;
    if (role == null || role.isEmpty) {
      role = await _readAuthKey('user_role');
      if (role != null && role.isNotEmpty) {
        _userRoleMem = role;
      }
    }
    return role;
  }

  Future<String?> getStoredUserPhone() async {
    var phone = _userPhoneMem;
    if (phone == null || phone.isEmpty) {
      phone = await _readAuthKey('user_phone');
      if (phone != null && phone.isNotEmpty) {
        _userPhoneMem = phone;
      }
    }
    return phone;
  }

  Future<bool> hasStoredAccessToken() async {
    var token = _accessTokenMem;
    if (token == null || token.isEmpty) {
      token = await _readAuthKey('access_token');
      if (token != null && token.isNotEmpty) {
        _accessTokenMem = token;
      }
    }
    return token != null && token.isNotEmpty;
  }

  /// For already-verified users on the same phone: refresh session without OTP.
  /// Active users can login directly with phone.
  Future<String?> loginWithPhoneOnly(String phone) async {
    // Clear current tab memory to avoid stale in-tab tokens before login.
    _accessTokenMem = null;
    _refreshTokenMem = null;
    _userPhoneMem = null;
    _userRoleMem = null;

    final deviceId = await _device.getDeviceId();
    // Use a clean client without auth/refresh interceptors for deterministic login.
    final authDio = Dio(BaseOptions(baseUrl: dio.options.baseUrl));
    final resp = await authDio.post('/auth/phone-login', data: {
      'phone': phone.trim(),
      'deviceId': deviceId,
    });
    final data = _asMap(resp.data);
    final access = data['accessToken']?.toString();
    final refresh = data['refreshToken']?.toString();
    final user = data['user'];
    String? role;
    String? userPhone;
    if (user is Map) {
      role = user['role']?.toString();
      userPhone = user['phone']?.toString();
    }

    if (access != null &&
        access.isNotEmpty &&
        refresh != null &&
        refresh.isNotEmpty) {
      _accessTokenMem = access;
      _refreshTokenMem = refresh;
      await _writeAuthKey('access_token', access);
      await _writeAuthKey('refresh_token', refresh);
      await _writeAuthKey('device_id', deviceId);
      if (userPhone != null && userPhone.isNotEmpty) {
        _userPhoneMem = userPhone;
        await _writeAuthKey('user_phone', userPhone);
      }
      if (role != null && role.isNotEmpty) {
        _userRoleMem = role;
        await _writeAuthKey('user_role', role);
      }
    }

    return role;
  }

  Future<Response<dynamic>?> _handle401AndRefresh(DioError error) async {
    // If a refresh is already in progress, wait for it to finish
    if (_refreshing) {
      final c = Completer<void>();
      _refreshWaiters.add(c);
      await c.future;
      // after refresh, retry the original request if access token exists
      var access = _accessTokenMem;
      if (access == null || access.isEmpty) {
        access = await _readAuthKey('access_token');
        if (access != null && access.isNotEmpty) {
          _accessTokenMem = access;
        }
      }
      if (access == null) return null;
      error.requestOptions.headers['Authorization'] = 'Bearer $access';
      return dio.fetch(error.requestOptions);
    }

    _refreshing = true;
    try {
      var refreshToken = _refreshTokenMem;
      if (refreshToken == null || refreshToken.isEmpty) {
        refreshToken = await _readAuthKey('refresh_token');
        if (refreshToken != null && refreshToken.isNotEmpty) {
          _refreshTokenMem = refreshToken;
        }
      }
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

  /// Sales-only: register owner on behalf during first-month operation flow.
  Future<dynamic> registerOwnerBySales(FormData form) async {
    final resp = await dio.post('/auth/sales/register-owner', data: form);
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
  Future<Map<String, dynamic>> verifyPayment(
      String txRef, String planId) async {
    final cleanTxRef = txRef.trim();
    final cleanPlanId = planId.trim();
    if (cleanTxRef.isEmpty || cleanPlanId.isEmpty) {
      throw ArgumentError(
          'txRef and planId are required for payment verification');
    }
    final resp = await dio.get('/payments/verify',
        queryParameters: {'tx_ref': cleanTxRef, 'planId': cleanPlanId});
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

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    if (data is String) {
      final s = data.trim();
      if (s.isEmpty || s == 'null') return <String, dynamic>{};
      final decoded = jsonDecode(data);
      return _asMap(decoded);
    }
    throw ArgumentError('Expected a JSON object');
  }

  List<dynamic> _asList(dynamic data) {
    if (data is List<dynamic>) return data;
    if (data is List) return List<dynamic>.from(data);
    if (data is String) {
      final s = data.trim();
      if (s.isEmpty || s == 'null') return <dynamic>[];
      final decoded = jsonDecode(data);
      return _asList(decoded);
    }
    throw ArgumentError('Expected a JSON array');
  }

  Future<Map<String, dynamic>?> getActiveWashRequest() async {
    try {
      final resp = await dio.get('/wash/requests/active');
      final data = resp.data;
      if (data == null) return null;
      if (data is String && (data.trim().isEmpty || data.trim() == 'null'))
        return null;
      final map = _asMap(data);
      if (map.isEmpty) return null;
      return map;
    } on DioException catch (e) {
      // If a non-owner somehow hits this endpoint, don't crash the UI.
      if (e.response?.statusCode == 403) return null;
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> getWasherActiveWashRequest() async {
    try {
      final resp = await dio.get('/wash/requests/active-washer');
      final data = resp.data;
      if (data == null) return null;
      if (data is String && (data.trim().isEmpty || data.trim() == 'null')) {
        return null;
      }
      final map = _asMap(data);
      if (map.isEmpty) return null;
      return map;
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) return null;
      rethrow;
    }
  }

  Future<Map<String, dynamic>> acceptWashRequest(String requestId) async {
    final resp = await dio.post('/wash/requests/$requestId/accept');
    return resp.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> listOpenWashRequests() async {
    final resp = await dio.get('/wash/requests/open');
    return _asList(resp.data);
  }

  Future<void> updateWasherPresence({
    required double lat,
    required double lng,
    bool online = true,
  }) async {
    await dio.post('/wash/washers/presence',
        data: {'lat': lat, 'lng': lng, 'online': online});
  }

  Future<List<dynamic>> getNearbyWashers({
    required double lat,
    required double lng,
    double radiusKm = 3,
  }) async {
    final resp = await dio.get('/wash/washers/nearby',
        queryParameters: {'lat': lat, 'lng': lng, 'radiusKm': radiusKm});
    return _asList(resp.data);
  }

  Future<Map<String, dynamic>?> getMyActiveSubscription() async {
    final resp = await dio.get('/subscriptions/me');
    if (resp.data == null) return null;
    try {
      return _asMap(resp.data);
    } catch (_) {
      return null;
    }
  }

  Future<bool> hasActiveSubscription() async {
    final sub = await getMyActiveSubscription();
    return sub != null;
  }

  Future<Map<String, dynamic>> getMySubscriptionStatus() async {
    final resp = await dio.get('/subscriptions/status');
    return _asMap(resp.data);
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

  Future<Map<String, dynamic>> finishWashRequestWithPhoto({
    required String requestId,
    required XFile afterPhoto,
  }) async {
    final bytes = await afterPhoto.readAsBytes();
    final form = FormData.fromMap({
      'afterPhoto': MultipartFile.fromBytes(
        bytes,
        filename: afterPhoto.name.isNotEmpty ? afterPhoto.name : 'after.jpg',
      ),
    });
    final resp = await dio.post('/wash/requests/$requestId/finish', data: form);
    return _asMap(resp.data);
  }

  Future<Map<String, dynamic>> ownerConfirmCompletion({
    required String requestId,
    required bool approved,
  }) async {
    final resp = await dio.post(
      '/wash/requests/$requestId/owner-confirm',
      data: {'approved': approved},
    );
    return _asMap(resp.data);
  }

  Future<List<dynamic>> getMySalesCommissions() async {
    final resp = await dio.get('/users/me/commissions');
    return _asList(resp.data);
  }

  Future<Map<String, dynamic>> getCurrentUser() async {
    final resp = await dio.get('/users/me');
    final data = _asMap(resp.data);
    final phone = data['phone']?.toString();
    final role = data['role']?.toString();
    if (phone != null && phone.isNotEmpty) {
      _userPhoneMem = phone;
      await _writeAuthKey('user_phone', phone);
    }
    if (role != null && role.isNotEmpty) {
      _userRoleMem = role;
      await _writeAuthKey('user_role', role);
    }
    return data;
  }
}
