import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';
import '../services/session_kv.dart';
import '../theme/app_theme.dart';
import '../widgets/logout_action.dart';
import '../widgets/theme_mode_action.dart';

class WasherRequestsScreen extends StatefulWidget {
  const WasherRequestsScreen({super.key});

  @override
  State<WasherRequestsScreen> createState() => _WasherRequestsScreenState();
}

class _WasherRequestsScreenState extends State<WasherRequestsScreen> {
  static const String _voyagerMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  static const String _voyagerDarkMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  static const String _voyagerDarkSoftMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
  static const String _hotMapUrlTemplate =
      'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
  static const List<String> _mapSubdomains = ['a', 'b', 'c'];
  final ApiClient _api = ApiClient();
  final WashSocketService _socket = WashSocketService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  bool _loading = true;
  List<dynamic> _requests = [];
  bool _online = false;
  Timer? _presenceTimer;
  String _currentPhone = '';
  String _currentRole = '';
  LatLng? _washerLocation;
  LatLng? _mapCenter;
  StreamSubscription<Position>? _washerPositionSub;
  String? _activeRequestId;
  LatLng? _activeOwnerLocation;
  List<LatLng> _washerTrail = [];
  List<LatLng> _ownerTrail = [];
  bool _submittingFinish = false;
  bool _startingWash = false;
  String? _activeRequestStatus;
  double _mapZoom = 15;
  bool _highContrastMap = true;
  final ImagePicker _picker = ImagePicker();
  static const String _onlinePrefFallbackKey = 'washer_online_preference';
  static const String _explicitOfflineFallbackKey =
      'washer_explicit_offline_preference';
  String _onlinePrefKey = 'washer_online_preference';
  String _explicitOfflinePrefKey = 'washer_explicit_offline_preference';

  Future<String?> _readPref(String key) async {
    if (isSessionKvAvailable) return sessionRead(key);
    return _storage.read(key: key);
  }

  Future<void> _writePref(String key, String value) async {
    if (isSessionKvAvailable) {
      sessionWrite(key, value);
      return;
    }
    await _storage.write(key: key, value: value);
  }

  String? _gebetaTileTemplate(
      {required bool isDark, required bool highContrast}) {
    if (isDark) {
      final dark = dotenv.env['FLUTTER_GEBETA_TILE_DARK_URL_TEMPLATE']?.trim();
      if (dark != null && dark.isNotEmpty) return dark;
    }
    if (!isDark && !highContrast) {
      final lightSoft =
          dotenv.env['FLUTTER_GEBETA_TILE_LIGHT_SOFT_URL_TEMPLATE']?.trim();
      if (lightSoft != null && lightSoft.isNotEmpty) return lightSoft;
    }
    final light = dotenv.env['FLUTTER_GEBETA_TILE_URL_TEMPLATE']?.trim();
    if (light != null && light.isNotEmpty) return light;
    return null;
  }

  String _injectGebetaToken(String template) {
    final token = dotenv.env['FLUTTER_GEBETA_API_TOKEN']?.trim() ?? '';
    if (token.isEmpty) return template;
    return template.replaceAll('{apiKey}', token);
  }

  bool _useGebetaTiles() {
    final raw = dotenv.env['FLUTTER_USE_GEBETA_TILES']?.trim().toLowerCase();
    return raw == 'true' || raw == '1' || raw == 'yes';
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    String phone = '';
    String role = '';
    try {
      final me = await _api.getCurrentUser();
      phone = (me['phone'] ?? '').toString();
      role = (me['role'] ?? '').toString();
    } catch (_) {
      // Fallback to locally stored values if /users/me fails transiently.
      phone = await _api.getStoredUserPhone() ?? '';
      role = await _api.getStoredUserRole() ?? '';
    }
    if (mounted) {
      setState(() {
        _currentPhone = phone;
        _currentRole = role.toUpperCase();
      });
    }
    _onlinePrefKey =
        'washer_online_preference_${phone.isNotEmpty ? phone : 'unknown'}';
    _explicitOfflinePrefKey =
        'washer_explicit_offline_preference_${phone.isNotEmpty ? phone : 'unknown'}';

    await _socket.connect();
    _socket.listenRequestCreated((event) {
      if (!mounted) return;
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;

      setState(() {
        final exists = _requests.any((r) {
          if (r is Map) {
            final id = (r['id'] ?? r['requestId'] ?? '').toString();
            return id == requestId;
          }
          return false;
        });
        if (exists) return;
        _requests = [
          {
            'id': requestId,
            'pickupLat': event['pickupLat'],
            'pickupLng': event['pickupLng'],
            'status': event['status'],
          },
          ..._requests,
        ];
      });
    });

    _socket.listenRequestAccepted((event) {
      if (!mounted) return;
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      setState(() {
        _requests = _requests.where((r) {
          if (r is Map) {
            final id = (r['id'] ?? r['requestId'] ?? '').toString();
            return id != requestId;
          }
          return true;
        }).toList();
      });
    });

    _socket.listenRequestCompleted((event) {
      if (!mounted) return;
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (_activeRequestId == requestId) {
        setState(() {
          _activeRequestId = null;
          _activeOwnerLocation = null;
          _ownerTrail = [];
          _washerTrail = [];
        });
      }
      setState(() {
        _requests = _requests.where((r) {
          if (r is Map) {
            final id = (r['id'] ?? r['requestId'] ?? '').toString();
            return id != requestId;
          }
          return true;
        }).toList();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Owner confirmed completion. Job counted for this month.')),
      );
    });

    _socket.listenRequestCancelled((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (!mounted) return;
      if (_activeRequestId == requestId) {
        setState(() {
          _activeRequestId = null;
          _activeRequestStatus = null;
          _activeOwnerLocation = null;
          _ownerTrail = [];
          _washerTrail = [];
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Owner cancelled this request.')),
        );
      }
      _load();
    });

    _socket.listenOwnerLocation((event) {
      final requestId = event['requestId']?.toString();
      if (_activeRequestId == null ||
          requestId == null ||
          requestId != _activeRequestId) {
        return;
      }
      final latRaw = event['lat'];
      final lngRaw = event['lng'];
      final lat = latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
      final lng = lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');
      if (lat == null || lng == null) return;
      final point = LatLng(lat, lng);
      if (!mounted) return;
      setState(() {
        _activeOwnerLocation = point;
        _appendTrail(_ownerTrail, point);
      });
      _followOnMap(point);
    });

    _socket.listenCompletionRequested((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (_activeRequestId == requestId && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Waiting owner Yes/No confirmation...')),
        );
      }
    });

    _socket.listenRequestStarted((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (!mounted) return;
      if (_activeRequestId == requestId) {
        setState(() {
          _activeRequestStatus = (event['status'] ?? '').toString();
        });
      }
    });

    await _load();
    await _restoreAcceptedRequest();
    await _startWasherTracking();

    // Authoritative restore from backend first (survives logout/relogin).
    try {
      final remotePresence = await _api.getWasherPresence();
      final remoteOnline = remotePresence?['online'] == true;
      if (remoteOnline) {
        final latRaw = remotePresence?['lat'];
        final lngRaw = remotePresence?['lng'];
        final lat =
            latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
        final lng =
            lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');
        if (lat != null && lng != null && mounted) {
          setState(() {
            _washerLocation = LatLng(lat, lng);
            _appendTrail(_washerTrail, _washerLocation!);
          });
          _followOnMap(_washerLocation!);
        }
        await _writePref(_onlinePrefKey, 'true');
        await _writePref(_onlinePrefFallbackKey, 'true');
        await _writePref(_explicitOfflinePrefKey, 'false');
        await _writePref(_explicitOfflineFallbackKey, 'false');
        await _toggleOnline(true, silent: true, fromAutoRestore: true);
        return;
      }
    } catch (_) {
      // Fall back to local preference restore.
    }

    // Restore previous online state so biker stays online across app restarts.
    final savedPhoneScoped = await _readPref(_onlinePrefKey);
    final savedFallback = await _readPref(_onlinePrefFallbackKey);
    final explicitOfflineScoped = await _readPref(_explicitOfflinePrefKey);
    final explicitOfflineFallback =
        await _readPref(_explicitOfflineFallbackKey);
    final explicitOffline = (explicitOfflineScoped == 'true') ||
        (explicitOfflineFallback == 'true');
    final savedOnline = (savedPhoneScoped == 'true') || (savedFallback == 'true');
    // If biker did not explicitly switch offline, prefer restoring online.
    if (savedOnline || !explicitOffline) {
      // Restore without clearing preference on transient startup failures.
      await _toggleOnline(true, silent: true, fromAutoRestore: true);
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _api.listOpenWashRequests();
      setState(() => _requests = data);
    } catch (e) {
      String msg = '$e';
      if (e is DioException) {
        String? backendMessage;
        final data = e.response?.data;
        if (data is Map && data['message'] != null) {
          final m = data['message'];
          backendMessage = m is List ? m.join(', ') : m.toString();
        }
        if (e.response?.statusCode == 403) {
          msg =
              'Insufficient permission for Accept. Logged role: ${_currentRole.isEmpty ? "-" : _currentRole}.'
              '${backendMessage != null ? ' Server: $backendMessage' : ''}';
        } else if (backendMessage != null) {
          msg = backendMessage;
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load requests: $msg')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _restoreAcceptedRequest() async {
    try {
      final active = await _api.getWasherActiveWashRequest();
      if (active == null) return;
      final requestId = active['id']?.toString();
      if (requestId == null || requestId.isEmpty) return;

      final latRaw = active['pickupLat'] ?? active['ownerLat'] ?? active['lat'];
      final lngRaw = active['pickupLng'] ?? active['ownerLng'] ?? active['lng'];
      final lat = latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
      final lng = lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');

      if (!mounted) return;
      setState(() {
        _activeRequestId = requestId;
        _activeRequestStatus = (active['status'] ?? '').toString();
        if (lat != null && lng != null) {
          _activeOwnerLocation = LatLng(lat, lng);
          _appendTrail(_ownerTrail, _activeOwnerLocation!);
        }
        if (_washerLocation != null) {
          _appendTrail(_washerTrail, _washerLocation!);
        }
      });
      _socket.joinRequest(requestId);
      if (_activeOwnerLocation != null) {
        _followOnMap(_activeOwnerLocation!);
      }
    } catch (_) {
      // If active endpoint is unavailable for this role, keep current behavior.
    }
  }

  Future<void> _startWasherTracking() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return;

      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        return;
      }

      final pos = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _washerLocation = LatLng(pos.latitude, pos.longitude);
        _appendTrail(_washerTrail, _washerLocation!);
      });
      _followOnMap(_washerLocation!);

      _washerPositionSub?.cancel();
      _washerPositionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 5,
        ),
      ).listen((p) async {
        final next = LatLng(p.latitude, p.longitude);
        if (!mounted) return;
        setState(() {
          _washerLocation = next;
          _appendTrail(_washerTrail, next);
        });
        _followOnMap(next);

        final activeId = _activeRequestId;
        if (activeId != null && activeId.isNotEmpty) {
          try {
            await _api.updateWasherLocation(
              requestId: activeId,
              lat: next.latitude,
              lng: next.longitude,
              heading: p.heading.isFinite ? p.heading : null,
              speed: p.speed.isFinite ? p.speed : null,
            );
          } catch (_) {
            // Ignore transient location update errors.
          }
        }
      });
    } catch (_) {
      // Ignore location errors for map preview.
    }
  }

  Future<void> _accept(Map<String, dynamic> request) async {
    final requestId = (request['id'] ?? request['requestId'] ?? '').toString();
    if (requestId.isEmpty) return;
    setState(() => _loading = true);
    try {
      final accepted = await _api.acceptWashRequest(requestId);
      _socket.joinRequest(requestId);
      final latRaw = request['pickupLat'];
      final lngRaw = request['pickupLng'];
      final lat = latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
      final lng = lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');
      setState(() {
        _activeRequestId = requestId;
        _activeRequestStatus = (accepted['status'] ?? 'ACCEPTED').toString();
        _ownerTrail = [];
        _washerTrail = [];
        if (_washerLocation != null) {
          _appendTrail(_washerTrail, _washerLocation!);
        }
        if (lat != null && lng != null) {
          _activeOwnerLocation = LatLng(lat, lng);
          _appendTrail(_ownerTrail, _activeOwnerLocation!);
          _followOnMap(_activeOwnerLocation!);
        }
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Accepted request. Live tracking started.')));
      // For now, just refresh list after accepting.
      await _load();
    } catch (e) {
      String msg = '$e';
      if (e is DioException) {
        final data = e.response?.data;
        if (data is Map && data['message'] != null) {
          final m = data['message'];
          msg = m is List ? m.join(', ') : m.toString();
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Accept failed: $msg')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _finishActiveRequestWithPhoto() async {
    final requestId = _activeRequestId;
    if (requestId == null || requestId.isEmpty || _submittingFinish) return;

    try {
      final picked = await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
      if (picked == null) return;
      setState(() => _submittingFinish = true);
      final updated =
          await _api.finishWashRequestWithPhoto(requestId: requestId, afterPhoto: picked);
      setState(() {
        _activeRequestStatus = (updated['status'] ?? '').toString();
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Photo submitted. Waiting for owner confirmation.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to submit finish photo: $e')),
      );
    } finally {
      if (mounted) setState(() => _submittingFinish = false);
    }
  }

  Future<void> _startActiveRequestWithBeforePhoto() async {
    final requestId = _activeRequestId;
    if (requestId == null || requestId.isEmpty || _startingWash) return;

    try {
      final picked =
          await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
      if (picked == null) return;
      setState(() => _startingWash = true);
      final started = await _api.startWashRequestWithBeforePhoto(
        requestId: requestId,
        beforePhoto: picked,
      );
      if (!mounted) return;
      setState(() {
        _activeRequestStatus = (started['status'] ?? '').toString();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Wash started. You can now finish with after photo.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to start wash: $e')),
      );
    } finally {
      if (mounted) setState(() => _startingWash = false);
    }
  }

  Future<void> _toggleOnline(
    bool value, {
    bool silent = false,
    bool fromAutoRestore = false,
  }) async {
    setState(() => _online = value);
    if (!value) {
      _presenceTimer?.cancel();
      try {
        // Mark offline using last known location (or 0/0 if unknown)
        await _api.updateWasherPresence(lat: 0, lng: 0, online: false);
      } catch (_) {}
      await _writePref(_onlinePrefKey, 'false');
      await _writePref(_onlinePrefFallbackKey, 'false');
      await _writePref(_explicitOfflinePrefKey, 'true');
      await _writePref(_explicitOfflineFallbackKey, 'true');
      return;
    }

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) throw Exception('Location service is disabled');

      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        throw Exception('Location permission denied');
      }

      final pos = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          _washerLocation = LatLng(pos.latitude, pos.longitude);
          _appendTrail(_washerTrail, _washerLocation!);
        });
      }
      await _api.updateWasherPresence(lat: pos.latitude, lng: pos.longitude, online: true);
      _presenceTimer?.cancel();
      _presenceTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
        try {
          final p = await Geolocator.getCurrentPosition();
          if (mounted) {
            setState(() => _washerLocation = LatLng(p.latitude, p.longitude));
          }
          await _api.updateWasherPresence(lat: p.latitude, lng: p.longitude, online: true);
        } catch (_) {
          // ignore background presence errors
        }
      });
      await _writePref(_onlinePrefKey, 'true');
      await _writePref(_onlinePrefFallbackKey, 'true');
      await _writePref(_explicitOfflinePrefKey, 'false');
      await _writePref(_explicitOfflineFallbackKey, 'false');
      if (!mounted || silent) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You are online')));
    } catch (e) {
      if (!mounted) return;
      // On app restart restore, keep intended online state instead of flipping to false.
      if (!fromAutoRestore) {
        setState(() => _online = false);
      }
      _presenceTimer?.cancel();
      if (!silent && !fromAutoRestore) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Go online failed: $e')));
      }
    }
  }

  @override
  void dispose() {
    _presenceTimer?.cancel();
    _washerPositionSub?.cancel();
    _socket.dispose();
    super.dispose();
  }

  void _appendTrail(List<LatLng> trail, LatLng point) {
    if (trail.isNotEmpty) {
      final last = trail.last;
      if ((last.latitude - point.latitude).abs() < 0.00001 &&
          (last.longitude - point.longitude).abs() < 0.00001) {
        return;
      }
    }
    trail.add(point);
    if (trail.length > 200) {
      trail.removeRange(0, trail.length - 200);
    }
  }

  void _followOnMap(LatLng point) {
    if (!mounted) return;
    _mapCenter = point;
  }

  Widget _buildLabeledMarker({
    required IconData icon,
    required Color color,
    required String label,
    required double size,
    Color? fillColor,
    Color? labelFillColor,
    Color? labelTextColor,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final markerFill = fillColor ??
        (isDark ? const Color(0xFF0D1220).withOpacity(0.95) : Colors.white.withOpacity(0.95));
    final chipFill = labelFillColor ??
        (isDark ? const Color(0xFF0A1020).withOpacity(0.95) : Colors.white.withOpacity(0.95));
    final chipText = labelTextColor ?? (isDark ? Colors.white : Colors.black87);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            color: markerFill,
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
          ),
          padding: const EdgeInsets.all(4),
          child: Icon(icon, color: color, size: size),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: chipFill,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFD6DEF0)),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: chipText,
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fallbackMapUrl = isDark
        ? (_highContrastMap
            ? _voyagerDarkMapUrlTemplate
            : _voyagerDarkSoftMapUrlTemplate)
        : (_highContrastMap ? _hotMapUrlTemplate : _voyagerMapUrlTemplate);
    final gebetaMapTemplate = _useGebetaTiles()
        ? _gebetaTileTemplate(isDark: isDark, highContrast: _highContrastMap)
        : null;
    final candidateMapUrl = _injectGebetaToken(gebetaMapTemplate ?? fallbackMapUrl);
    final hasRequiredPlaceholders = candidateMapUrl.contains('{z}') &&
        candidateMapUrl.contains('{x}') &&
        candidateMapUrl.contains('{y}');
    final mapUrl = hasRequiredPlaceholders ? candidateMapUrl : fallbackMapUrl;
    final mapUsesSubdomains = mapUrl.contains('{s}');
    final ownerMarkers = <LatLng>[];
    for (final r in _requests) {
      if (r is Map) {
        final latRaw = r['pickupLat'];
        final lngRaw = r['pickupLng'];
        final lat = latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
        final lng = lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');
        if (lat != null && lng != null) {
          ownerMarkers.add(LatLng(lat, lng));
        }
      }
    }
    final center = _mapCenter ??
        _washerLocation ??
        _activeOwnerLocation ??
        (ownerMarkers.isNotEmpty ? ownerMarkers.first : LatLng(9.03, 38.74));
    final currentStatus = (_activeRequestStatus ?? '').toUpperCase();
    final canStartWash = _activeRequestId != null && currentStatus == 'ACCEPTED';
    final canFinishWash = _activeRequestId != null && currentStatus == 'IN_PROGRESS';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Washer Requests'),
        actions: [
          Row(
            children: [
              Text(
                'Online',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              Switch(value: _online, onChanged: _loading ? null : _toggleOnline),
            ],
          ),
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
          const ThemeModeAction(),
          const LogoutAction(),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF0A1020).withOpacity(0.92)
                        : Colors.white,
                    border: Border.all(
                      color: isDark
                          ? const Color(0xFF294180)
                          : const Color(0xFFD6DEF0),
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Logged in as',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Phone: ${_currentPhone.isEmpty ? "-" : _currentPhone}',
                        style: TextStyle(
                            color: isDark ? Colors.white70 : Colors.black87),
                      ),
                      Text(
                        'Role: ${_currentRole.isEmpty ? "-" : _currentRole}',
                        style: TextStyle(
                            color: isDark ? Colors.white70 : Colors.black87),
                      ),
                      Text(
                        'Active request: ${_activeRequestId ?? "-"}',
                        style: TextStyle(
                            color: isDark ? Colors.white70 : Colors.black87),
                      ),
                    ],
                  ),
                ),
                Container(
                  height: 340,
                  margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFD6DEF0)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: FlutterMap(
                          options: MapOptions(
                            center: center,
                            zoom: _mapZoom,
                            minZoom: 4,
                            maxZoom: 19,
                          ),
                          children: [
                            TileLayer(
                              urlTemplate: mapUrl,
                              subdomains:
                                  mapUsesSubdomains ? _mapSubdomains : const [],
                              retinaMode: true,
                              userAgentPackageName: 'com.carwash.mobile',
                            ),
                            MarkerLayer(
                              markers: [
                                if (_washerLocation != null)
                                  Marker(
                                    point: _washerLocation!,
                                    width: 96,
                                    height: 74,
                                    builder: (_) => _buildLabeledMarker(
                                      icon: Icons.pedal_bike,
                                      color: isDark
                                          ? const Color(0xFF00E5FF)
                                          : AppTheme.brandCyan,
                                      label: 'You',
                                      size: 28,
                                      fillColor:
                                          isDark ? const Color(0xFF060A16) : null,
                                      labelFillColor:
                                          isDark ? const Color(0xFF060A16) : null,
                                      labelTextColor:
                                          isDark ? const Color(0xFFE6FBFF) : null,
                                    ),
                                  ),
                                if (_activeOwnerLocation != null)
                                  Marker(
                                    point: _activeOwnerLocation!,
                                    width: 100,
                                    height: 74,
                                    builder: (_) => _buildLabeledMarker(
                                      icon: Icons.person_pin_circle,
                                      color: AppTheme.brandNavy,
                                      label: 'Owner',
                                      size: 30,
                                    ),
                                  ),
                                for (final p in ownerMarkers)
                                  Marker(
                                    point: p,
                                    width: 100,
                                    height: 74,
                                    builder: (_) => _buildLabeledMarker(
                                      icon: Icons.person_pin_circle,
                                      color: AppTheme.brandNavy,
                                      label: 'Request',
                                      size: 30,
                                    ),
                                  ),
                              ],
                            ),
                            if (_ownerTrail.length > 1)
                              PolylineLayer(
                                polylines: [
                                  Polyline(
                                    points: _ownerTrail,
                                    strokeWidth: 5,
                                    color: AppTheme.brandNavy.withOpacity(0.8),
                                  ),
                                ],
                              ),
                            if (_washerTrail.length > 1)
                              PolylineLayer(
                                polylines: [
                                  Polyline(
                                    points: _washerTrail,
                                    strokeWidth: 5,
                                    color: AppTheme.brandCyan.withOpacity(0.85),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                      Positioned(
                        top: 8,
                        left: 74,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0A1020).withOpacity(0.94)
                                : Colors.white.withOpacity(0.94),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF294180)
                                  : const Color(0xFFD6DEF0),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'Map',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? Colors.white : Colors.black87,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Clear'),
                                selected: _highContrastMap,
                                onSelected: (v) {
                                  if (!v) return;
                                  setState(() => _highContrastMap = true);
                                },
                              ),
                              const SizedBox(width: 6),
                              ChoiceChip(
                                label: const Text('Soft'),
                                selected: !_highContrastMap,
                                onSelected: (v) {
                                  if (!v) return;
                                  setState(() => _highContrastMap = false);
                                },
                              ),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 8,
                        top: 8,
                        child: Column(
                          children: [
                            FloatingActionButton.small(
                              heroTag: 'washer-map-zoom-in',
                              onPressed: () {
                                setState(() {
                                  _mapZoom =
                                      (_mapZoom + 1).clamp(4, 19).toDouble();
                                });
                              },
                              child: const Icon(Icons.add),
                            ),
                            const SizedBox(height: 8),
                            FloatingActionButton.small(
                              heroTag: 'washer-map-zoom-out',
                              onPressed: () {
                                setState(() {
                                  _mapZoom =
                                      (_mapZoom - 1).clamp(4, 19).toDouble();
                                });
                              },
                              child: const Icon(Icons.remove),
                            ),
                            const SizedBox(height: 8),
                            FloatingActionButton.small(
                              heroTag: 'washer-map-center',
                              onPressed: () {
                                final point =
                                    _activeOwnerLocation ?? _washerLocation;
                                if (point == null) return;
                                setState(() {
                                  _mapCenter = point;
                                  _mapZoom = 16;
                                });
                              },
                              child: const Icon(Icons.my_location),
                            ),
                          ],
                        ),
                      ),
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0A1020).withOpacity(0.92)
                                : Colors.white.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF294180)
                                  : const Color(0xFFD6DEF0),
                            ),
                          ),
                          child: Text(
                            _activeRequestId != null
                                ? 'Live tracking active'
                                : 'Owner markers: ${ownerMarkers.length}',
                            style: TextStyle(
                                color:
                                    isDark ? Colors.white : Colors.black87),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 8,
                        bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0A1020).withOpacity(0.92)
                                : Colors.white.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF294180)
                                  : const Color(0xFFD6DEF0),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.timeline,
                                      color: AppTheme.brandNavy, size: 16),
                                  SizedBox(width: 6),
                                  Text('Owner path',
                                      style: TextStyle(
                                          color: isDark
                                              ? Colors.white
                                              : Colors.black87)),
                                ],
                              ),
                              SizedBox(height: 4),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.timeline,
                                      color: AppTheme.brandCyan, size: 16),
                                  SizedBox(width: 6),
                                  Text('Biker path',
                                      style: TextStyle(
                                          color: isDark
                                              ? Colors.white
                                              : Colors.black87)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: (!canStartWash || _startingWash || _submittingFinish)
                              ? null
                              : _startActiveRequestWithBeforePhoto,
                          icon: const Icon(Icons.play_circle_fill),
                          label: Text(
                            _startingWash
                                ? 'Starting...'
                                : (_activeRequestId == null
                                    ? 'Accept a request first'
                                    : (canStartWash
                                        ? 'Start Wash (Before Photo)'
                                        : 'Wash already started')),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: (!canFinishWash || _submittingFinish || _startingWash)
                              ? null
                              : _finishActiveRequestWithPhoto,
                          icon: const Icon(Icons.camera_alt),
                          label: Text(
                            _submittingFinish
                                ? 'Submitting...'
                                : (_activeRequestId == null
                                    ? 'Accept a request first'
                                    : (canFinishWash
                                        ? 'Finish Wash (After Photo)'
                                        : 'Start wash first')),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: _requests.isEmpty
                      ? const Center(child: Text('No open requests'))
                      : ListView.builder(
                          itemCount: _requests.length,
                          itemBuilder: (ctx, i) {
                            final r = _requests[i] as Map<String, dynamic>;
                            final id = (r['id'] ?? r['requestId'] ?? '').toString();
                            final owner = r['owner'] as Map<String, dynamic>?;
                            final ownerPhone = owner != null ? (owner['phone'] ?? '').toString() : '';
                            final pickupLat = r['pickupLat'];
                            final pickupLng = r['pickupLng'];

                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: ListTile(
                                title: Text(ownerPhone.isNotEmpty ? 'Owner: $ownerPhone' : 'Wash Request'),
                                subtitle: Text('Pickup: $pickupLat, $pickupLng'),
                                trailing: ElevatedButton(
                                  onPressed: id.isEmpty ? null : () => _accept(r),
                                  child: const Text('Accept'),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
