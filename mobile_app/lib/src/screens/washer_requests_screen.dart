import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';

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

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final phone = await _storage.read(key: 'user_phone') ?? '';
    final role = await _storage.read(key: 'user_role') ?? '';
    if (mounted) {
      setState(() {
        _currentPhone = phone;
        _currentRole = role.toUpperCase();
      });
    }

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

    await _load();
    await _refreshWasherLocation();
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

  Future<void> _refreshWasherLocation() async {
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
      setState(() => _washerLocation = LatLng(pos.latitude, pos.longitude));
    } catch (_) {
      // Ignore location errors for map preview.
    }
  }

  Future<void> _accept(String requestId) async {
    setState(() => _loading = true);
    try {
      await _api.acceptWashRequest(requestId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Accepted request')));
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

  Future<void> _toggleOnline(bool value) async {
    setState(() => _online = value);
    if (!value) {
      _presenceTimer?.cancel();
      try {
        // Mark offline using last known location (or 0/0 if unknown)
        await _api.updateWasherPresence(lat: 0, lng: 0, online: false);
      } catch (_) {}
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
        setState(() => _washerLocation = LatLng(pos.latitude, pos.longitude));
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
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You are online')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _online = false);
      _presenceTimer?.cancel();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Go online failed: $e')));
    }
  }

  @override
  void dispose() {
    _presenceTimer?.cancel();
    _socket.dispose();
    super.dispose();
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
    final center = _washerLocation ?? (ownerMarkers.isNotEmpty ? ownerMarkers.first : LatLng(9.03, 38.74));

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
                          child: Text('Owner markers: ${ownerMarkers.length}'),
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
                                  onPressed: id.isEmpty ? null : () => _accept(id),
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
