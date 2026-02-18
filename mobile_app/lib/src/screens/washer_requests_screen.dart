import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';
import '../services/session_kv.dart';

class WasherRequestsScreen extends StatefulWidget {
  const WasherRequestsScreen({super.key});

  @override
  State<WasherRequestsScreen> createState() => _WasherRequestsScreenState();
}

class _WasherRequestsScreenState extends State<WasherRequestsScreen> {
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
  final ImagePicker _picker = ImagePicker();
  static const String _onlinePrefFallbackKey = 'washer_online_preference';
  String _onlinePrefKey = 'washer_online_preference';

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

    await _load();
    await _startWasherTracking();

    // Restore previous online state so biker stays online across app restarts.
    final savedPhoneScoped = await _readPref(_onlinePrefKey);
    final savedFallback = await _readPref(_onlinePrefFallbackKey);
    final savedOnline = (savedPhoneScoped == 'true') || (savedFallback == 'true');
    if (savedOnline) {
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
      await _api.acceptWashRequest(requestId);
      _socket.joinRequest(requestId);
      final latRaw = request['pickupLat'];
      final lngRaw = request['pickupLng'];
      final lat = latRaw is num ? latRaw.toDouble() : double.tryParse('$latRaw');
      final lng = lngRaw is num ? lngRaw.toDouble() : double.tryParse('$lngRaw');
      setState(() {
        _activeRequestId = requestId;
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
      await _api.finishWashRequestWithPhoto(requestId: requestId, afterPhoto: picked);
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
      if (!mounted || silent) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You are online')));
    } catch (e) {
      if (!mounted) return;
      // On app restart restore, keep intended online state instead of flipping to false.
      if (!fromAutoRestore) {
        setState(() => _online = false);
      }
      _presenceTimer?.cancel();
      if (!fromAutoRestore) {
        await _writePref(_onlinePrefKey, 'false');
        await _writePref(_onlinePrefFallbackKey, 'false');
      }
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

  @override
  Widget build(BuildContext context) {
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Washer Requests'),
        actions: [
          Row(
            children: [
              const Text('Online', style: TextStyle(fontSize: 12)),
              Switch(value: _online, onChanged: _loading ? null : _toggleOnline),
            ],
          ),
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
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
                    color: Colors.blueGrey.shade50,
                    border: Border.all(color: Colors.blueGrey.shade100),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Logged in as', style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('Phone: ${_currentPhone.isEmpty ? "-" : _currentPhone}'),
                      Text('Role: ${_currentRole.isEmpty ? "-" : _currentRole}'),
                      Text('Active request: ${_activeRequestId ?? "-"}'),
                    ],
                  ),
                ),
                Container(
                  height: 250,
                  margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.black12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: FlutterMap(
                          options: MapOptions(center: center, zoom: 14),
                          children: [
                            TileLayer(
                              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                              userAgentPackageName: 'com.carwash.mobile',
                            ),
                            MarkerLayer(
                              markers: [
                                if (_washerLocation != null)
                                  Marker(
                                    point: _washerLocation!,
                                    width: 42,
                                    height: 42,
                                    builder: (_) => const Icon(
                                      Icons.pedal_bike,
                                      color: Colors.blue,
                                      size: 34,
                                    ),
                                  ),
                                if (_activeOwnerLocation != null)
                                  Marker(
                                    point: _activeOwnerLocation!,
                                    width: 42,
                                    height: 42,
                                    builder: (_) => const Icon(
                                      Icons.person_pin_circle,
                                      color: Colors.red,
                                      size: 36,
                                    ),
                                  ),
                                for (final p in ownerMarkers)
                                  Marker(
                                    point: p,
                                    width: 42,
                                    height: 42,
                                    builder: (_) => const Icon(
                                      Icons.person_pin_circle,
                                      color: Colors.red,
                                      size: 36,
                                    ),
                                  ),
                              ],
                            ),
                            if (_ownerTrail.length > 1)
                              PolylineLayer(
                                polylines: [
                                  Polyline(
                                    points: _ownerTrail,
                                    strokeWidth: 3,
                                    color: Colors.red.withOpacity(0.8),
                                  ),
                                ],
                              ),
                            if (_washerTrail.length > 1)
                              PolylineLayer(
                                polylines: [
                                  Polyline(
                                    points: _washerTrail,
                                    strokeWidth: 3,
                                    color: Colors.blue.withOpacity(0.8),
                                  ),
                                ],
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
                            color: Colors.white.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _activeRequestId != null
                                ? 'Live tracking active'
                                : 'Owner markers: ${ownerMarkers.length}',
                          ),
                        ),
                      ),
                      Positioned(
                        left: 8,
                        bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.timeline, color: Colors.red, size: 16),
                                  SizedBox(width: 6),
                                  Text('Owner path'),
                                ],
                              ),
                              SizedBox(height: 4),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.timeline, color: Colors.blue, size: 16),
                                  SizedBox(width: 6),
                                  Text('Biker path'),
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
                          onPressed: (_activeRequestId == null || _submittingFinish)
                              ? null
                              : _finishActiveRequestWithPhoto,
                          icon: const Icon(Icons.camera_alt),
                          label: Text(
                            _submittingFinish
                                ? 'Submitting...'
                                : (_activeRequestId == null
                                    ? 'Accept a request first'
                                    : 'Finish Wash (Upload Photo)'),
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
