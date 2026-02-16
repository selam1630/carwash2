import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';

class RequestWashScreen extends StatefulWidget {
  const RequestWashScreen({super.key});

  @override
  State<RequestWashScreen> createState() => _RequestWashScreenState();
}

class _RequestWashScreenState extends State<RequestWashScreen> {
  final ApiClient _api = ApiClient();
  final WashSocketService _socket = WashSocketService();

  LatLng? _ownerLocation;
  LatLng? _washerLocation;
  List<_NearbyWasher> _nearbyWashers = [];
  String? _requestId;
  String _status = 'Ready to request a wash';
  bool _loading = false;
  Timer? _nearbyTimer;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _resolveLocation();
    await _socket.connect();
    _startNearbyPolling();

    _socket.listenRequestAccepted((event) {
      if (_requestId == null || event['requestId'] != _requestId) return;
      final acceptedWasherId = event['washerId']?.toString();
      LatLng? acceptedLocation;
      if (acceptedWasherId != null && acceptedWasherId.isNotEmpty) {
        for (final w in _nearbyWashers) {
          if (w.washerId == acceptedWasherId) {
            acceptedLocation = LatLng(w.lat, w.lng);
            break;
          }
        }
      }
      setState(() {
        _status = 'Car washer accepted your request';
        if (acceptedLocation != null) {
          _washerLocation = acceptedLocation;
        }
      });
    });

    _socket.listenWasherLocation((event) {
      if (_requestId == null || event['requestId'] != _requestId) return;
      final lat = _asDouble(event['lat']);
      final lng = _asDouble(event['lng']);
      if (lat == null || lng == null) return;
      setState(() {
        _washerLocation = LatLng(lat, lng);
        _status = 'Washer on the way';
      });
    });

    try {
      final active = await _api.getActiveWashRequest();
      if (active != null && active['id'] != null) {
        final activeId = active['id'].toString();
        setState(() {
          _requestId = activeId;
          _status = 'You have an active wash request';
        });
        _socket.joinRequest(activeId);

        final lat = _asDouble(active['washerLat']);
        final lng = _asDouble(active['washerLng']);
        if (lat != null && lng != null) {
          setState(() => _washerLocation = LatLng(lat, lng));
        }
      }
    } catch (_) {
      // Don't crash the map screen if active-request check fails on web.
    }
  }

  void _startNearbyPolling() {
    _nearbyTimer?.cancel();
    if (_ownerLocation == null) return;

    _nearbyTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_ownerLocation == null) return;
      try {
        final items = await _api.getNearbyWashers(
          lat: _ownerLocation!.latitude,
          lng: _ownerLocation!.longitude,
          radiusKm: 3,
        );
        final washers = <_NearbyWasher>[];
        for (final it in items) {
          if (it is Map) {
            final washerId = it['washerId']?.toString();
            final lat = _asDouble(it['lat']);
            final lng = _asDouble(it['lng']);
            if (washerId != null && washerId.isNotEmpty && lat != null && lng != null) {
              washers.add(_NearbyWasher(washerId: washerId, lat: lat, lng: lng));
            }
          }
        }
        if (mounted) setState(() => _nearbyWashers = washers);
      } catch (_) {
        // ignore polling errors
      }
    });
  }
  Future<void> _resolveLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      setState(() => _status = 'Please enable location service');
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() => _status = 'Location permission is required to request a wash');
      return;
    }

    final pos = await Geolocator.getCurrentPosition();
    setState(() => _ownerLocation = LatLng(pos.latitude, pos.longitude));
    _startNearbyPolling();
  }

  Future<void> _requestWash() async {
    if (_ownerLocation == null) {
      setState(() => _status = 'Waiting for your location');
      return;
    }

    setState(() => _loading = true);
    try {
      final request = await _api.createWashRequest(
        pickupLat: _ownerLocation!.latitude,
        pickupLng: _ownerLocation!.longitude,
      );

      final createdId = request['id']?.toString();
      if (createdId == null || createdId.isEmpty) {
        throw Exception('Request created but missing request id');
      }

      _socket.joinRequest(createdId);
      setState(() {
        _requestId = createdId;
        _status = 'Request sent. Looking for the nearest washer...';
      });
    } catch (e) {
      String message = e.toString();
      if (e is DioException) {
        final data = e.response?.data;
        if (data is Map && data['message'] != null) {
          final m = data['message'];
          message = m is List ? m.join(', ') : m.toString();
        }
      }
      setState(() => _status = message);
    } finally {
      setState(() => _loading = false);
    }
  }

  double? _asDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  @override
  void dispose() {
    _nearbyTimer?.cancel();
    _socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final center = _ownerLocation ?? LatLng(9.03, 38.74);
    final nearbyCount = _nearbyWashers.length;
    final markers = <Marker>[
      if (_ownerLocation != null)
        Marker(
          point: _ownerLocation!,
          width: 44,
          height: 44,
          builder: (_) => Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.9),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.blue, width: 2),
            ),
            child: const Icon(Icons.person_pin_circle, color: Colors.blue, size: 36),
          ),
        ),
      for (final w in _nearbyWashers)
        Marker(
          point: LatLng(w.lat, w.lng),
          width: 40,
          height: 40,
          builder: (_) => Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.9),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.orange, width: 2),
            ),
            child: const Icon(Icons.pedal_bike, color: Colors.orange, size: 26),
          ),
        ),
      if (_washerLocation != null)
        Marker(
          point: _washerLocation!,
          width: 44,
          height: 44,
          builder: (_) => Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.9),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.green, width: 2),
            ),
            child: const Icon(Icons.delivery_dining, color: Colors.green, size: 34),
          ),
        ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Request Wash')),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  options: MapOptions(center: center, zoom: 14),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.carwash.mobile',
                    ),
                    MarkerLayer(markers: markers),
                  ],
                ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.92),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.black12),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Legend', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.person_pin_circle, color: Colors.blue, size: 18),
                            SizedBox(width: 8),
                            Text('You'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.pedal_bike, color: Colors.orange, size: 18),
                            const SizedBox(width: 8),
                            Text('Nearby washers ($nearbyCount)'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.delivery_dining, color: Colors.green, size: 18),
                            SizedBox(width: 8),
                            Text('Assigned washer'),
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
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(_status),
                const SizedBox(height: 4),
                Text('Nearby washers: $nearbyCount'),
                const SizedBox(height: 10),
                ElevatedButton(
                  onPressed: _loading ? null : _requestWash,
                  child: _loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_requestId == null ? 'Request Wash' : 'Request Active'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NearbyWasher {
  final String washerId;
  final double lat;
  final double lng;

  _NearbyWasher({
    required this.washerId,
    required this.lat,
    required this.lng,
  });
}
