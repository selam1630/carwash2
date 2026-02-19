import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/logout_action.dart';

class RequestWashScreen extends StatefulWidget {
  const RequestWashScreen({super.key});

  @override
  State<RequestWashScreen> createState() => _RequestWashScreenState();
}

class _RequestWashScreenState extends State<RequestWashScreen> {
  static const String _voyagerMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  static const String _hotMapUrlTemplate =
      'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
  static const List<String> _mapSubdomains = ['a', 'b', 'c'];
  final ApiClient _api = ApiClient();
  final WashSocketService _socket = WashSocketService();

  LatLng? _ownerLocation;
  LatLng? _washerLocation;
  LatLng? _mapCenter;
  List<_NearbyWasher> _nearbyWashers = [];
  String? _requestId;
  String _status = 'Ready to request a wash';
  bool _loading = false;
  double _mapZoom = 15;
  bool _highContrastMap = true;
  bool _didInitialNearbyFocus = false;
  Timer? _nearbyTimer;
  StreamSubscription<Position>? _ownerPositionSub;
  List<LatLng> _ownerTrail = [];
  List<LatLng> _washerTrail = [];
  bool _completionDialogOpen = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _resolveLocation();
    await _socket.connect();
    _startNearbyPolling();
    _startOwnerLiveTracking();

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
        _appendTrail(_washerTrail, _washerLocation!);
        _status = 'Washer on the way';
      });
      _followOnMap(_washerLocation!);
    });

    _socket.listenCompletionRequested((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (_requestId != requestId) return;
      _showCompletionDialog(requestId);
    });

    _socket.listenRequestCompleted((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (_requestId != requestId) return;
      if (!mounted) return;
      setState(() {
        _status = 'Wash completed and confirmed';
        _requestId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thanks! Job marked as completed.')),
      );
    });

    _socket.listenRequestReopened((event) {
      final requestId = event['requestId']?.toString();
      if (requestId == null || requestId.isEmpty) return;
      if (_requestId != requestId) return;
      if (!mounted) return;
      setState(() {
        _status =
            'You marked it as not finished. Reassigning nearest washer...';
        _washerLocation = null;
        _washerTrail = [];
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Request reopened and sent to nearby washers.')),
      );
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
          setState(() {
            _washerLocation = LatLng(lat, lng);
            _appendTrail(_washerTrail, _washerLocation!);
          });
          _followOnMap(_washerLocation!);
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
      _refreshNearbyWashers();
    });
  }

  Future<void> _refreshNearbyWashers() async {
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
          if (washerId != null &&
              washerId.isNotEmpty &&
              lat != null &&
              lng != null) {
            washers.add(_NearbyWasher(washerId: washerId, lat: lat, lng: lng));
          }
        }
      }
      if (!mounted) return;
      setState(() => _nearbyWashers = washers);
      if (_requestId == null && _nearbyWashers.isNotEmpty) {
        _focusNearbyCluster(force: true);
      } else {
        _focusNearbyCluster();
      }
    } catch (_) {
      // ignore polling errors
    }
  }

  void _focusNearbyCluster({bool force = false}) {
    if (_didInitialNearbyFocus && !force) return;
    if (_nearbyWashers.isEmpty) return;

    // Focus on bikers only so they appear first and larger on initial view.
    var minLat = _nearbyWashers.first.lat;
    var maxLat = _nearbyWashers.first.lat;
    var minLng = _nearbyWashers.first.lng;
    var maxLng = _nearbyWashers.first.lng;

    for (final w in _nearbyWashers) {
      if (w.lat < minLat) minLat = w.lat;
      if (w.lat > maxLat) maxLat = w.lat;
      if (w.lng < minLng) minLng = w.lng;
      if (w.lng > maxLng) maxLng = w.lng;
    }

    final center = LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    final latDelta = (maxLat - minLat).abs();
    final lngDelta = (maxLng - minLng).abs();
    final span = latDelta > lngDelta ? latDelta : lngDelta;

    double zoom;
    if (_nearbyWashers.length == 1) {
      zoom = 17.2;
    } else if (span < 0.002) {
      zoom = 17.0;
    } else if (span < 0.005) {
      zoom = 16.2;
    } else if (span < 0.012) {
      zoom = 15.4;
    } else {
      zoom = 14.6;
    }

    if (!mounted) return;
    setState(() {
      _mapCenter = center;
      _mapZoom = zoom;
      _didInitialNearbyFocus = true;
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
      setState(
          () => _status = 'Location permission is required to request a wash');
      return;
    }

    final pos = await Geolocator.getCurrentPosition();
    setState(() {
      _ownerLocation = LatLng(pos.latitude, pos.longitude);
      _appendTrail(_ownerTrail, _ownerLocation!);
    });
    await _refreshNearbyWashers();
    _startNearbyPolling();
  }

  void _startOwnerLiveTracking() {
    _ownerPositionSub?.cancel();
    _ownerPositionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 5,
      ),
    ).listen((pos) {
      final next = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() {
        _ownerLocation = next;
        _appendTrail(_ownerTrail, next);
      });
      if (_requestId == null && _nearbyWashers.isNotEmpty) {
        _focusNearbyCluster(force: true);
      } else if (_requestId != null) {
        _followOnMap(next);
      }

      final requestId = _requestId;
      if (requestId != null && requestId.isNotEmpty) {
        _socket.sendOwnerLocation(
          requestId: requestId,
          lat: next.latitude,
          lng: next.longitude,
        );
      }
    });
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
      _socket.sendOwnerLocation(
        requestId: createdId,
        lat: _ownerLocation!.latitude,
        lng: _ownerLocation!.longitude,
      );
      setState(() {
        _requestId = createdId;
        _status = 'Request sent. Looking for the nearest washer...';
      });
    } catch (e) {
      String message = e.toString();
      if (e is DioException) {
        if (e.response?.statusCode == 403) {
          final data = e.response?.data;
          String serverMsg = '';
          if (data is Map && data['message'] != null) {
            final m = data['message'];
            serverMsg = m is List ? m.join(', ') : m.toString();
          }
          final lower = serverMsg.toLowerCase();
          if (lower.contains('package') ||
              lower.contains('subscribe') ||
              lower.contains('subscription')) {
            if (!mounted) return;
            await showDialog<void>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Subscribe again'),
                content: const Text(
                  'Your package is finished or inactive. Please subscribe again to request a wash.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text('Cancel'),
                  ),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      Navigator.pushNamed(context, '/subscriptions');
                    },
                    child: const Text('View Packages'),
                  ),
                ],
              ),
            );
            setState(() => _loading = false);
            return;
          }
        }
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
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.95),
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
            color: Colors.white.withOpacity(0.95),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFD6DEF0)),
          ),
          child: Text(
            label,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Future<void> _showCompletionDialog(String requestId) async {
    if (!mounted || _completionDialogOpen) return;
    _completionDialogOpen = true;
    try {
      final approved = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Wash finished?'),
          content: const Text(
              'Car washer submitted completion. Is the washing finished?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('No'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Yes'),
            ),
          ],
        ),
      );

      if (approved == null) return;
      await _api.ownerConfirmCompletion(
          requestId: requestId, approved: approved);
      if (!mounted) return;
      if (approved) {
        setState(() {
          _status = 'Wash completed and confirmed';
          _requestId = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Confirmed. It is counted for the biker.')),
        );
      } else {
        setState(() {
          _status = 'Not finished. Request reopened to nearby washers.';
          _washerLocation = null;
          _washerTrail = [];
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to submit confirmation: $e')),
      );
    } finally {
      _completionDialogOpen = false;
    }
  }

  @override
  void dispose() {
    _nearbyTimer?.cancel();
    _ownerPositionSub?.cancel();
    _socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final center = _mapCenter ?? _ownerLocation ?? LatLng(9.03, 38.74);
    final nearbyCount = _nearbyWashers.length;
    final markers = <Marker>[
      if (_ownerLocation != null)
        Marker(
          point: _ownerLocation!,
          width: 86,
          height: 72,
          builder: (_) => _buildLabeledMarker(
            icon: Icons.person_pin_circle,
            color: AppTheme.brandNavy,
            label: 'You',
            size: 30,
          ),
        ),
      for (final w in _nearbyWashers)
        Marker(
          point: LatLng(w.lat, w.lng),
          width: 90,
          height: 72,
          builder: (_) => _buildLabeledMarker(
            icon: Icons.pedal_bike,
            color: AppTheme.brandCyan,
            label: 'Nearby',
            size: 24,
          ),
        ),
      if (_washerLocation != null)
        Marker(
          point: _washerLocation!,
          width: 100,
          height: 74,
          builder: (_) => _buildLabeledMarker(
            icon: Icons.delivery_dining,
            color: Colors.green,
            label: 'Assigned',
            size: 28,
          ),
        ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Request Wash'),
        actions: const [LogoutAction()],
      ),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  options: MapOptions(
                    center: center,
                    zoom: _mapZoom,
                    minZoom: 4,
                    maxZoom: 19,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: _highContrastMap
                          ? _hotMapUrlTemplate
                          : _voyagerMapUrlTemplate,
                      subdomains: _mapSubdomains,
                      retinaMode: true,
                      userAgentPackageName: 'com.carwash.mobile',
                    ),
                    MarkerLayer(markers: markers),
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
                            color: Colors.green.withOpacity(0.8),
                          ),
                        ],
                      ),
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
                      border: Border.all(color: const Color(0xFFD6DEF0)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Legend',
                            style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.person_pin_circle,
                                color: AppTheme.brandNavy, size: 18),
                            SizedBox(width: 8),
                            Text('You'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.pedal_bike,
                                color: AppTheme.brandCyan, size: 18),
                            const SizedBox(width: 8),
                            Text('Nearby washers ($nearbyCount)'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.delivery_dining,
                                color: Colors.green, size: 18),
                            SizedBox(width: 8),
                            Text('Assigned washer'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.timeline,
                                color: AppTheme.brandNavy, size: 18),
                            SizedBox(width: 8),
                            Text('Your path'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.timeline, color: Colors.green, size: 18),
                            SizedBox(width: 8),
                            Text('Washer path'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 12,
                  left: 82,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.94),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFD6DEF0)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('Map',
                            style: TextStyle(fontWeight: FontWeight.w600)),
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
                  left: 12,
                  top: 12,
                  child: Column(
                    children: [
                      FloatingActionButton.small(
                        heroTag: 'owner-map-zoom-in',
                        onPressed: () {
                          setState(() {
                            _mapZoom = (_mapZoom + 1).clamp(4, 19).toDouble();
                          });
                        },
                        child: const Icon(Icons.add),
                      ),
                      const SizedBox(height: 8),
                      FloatingActionButton.small(
                        heroTag: 'owner-map-zoom-out',
                        onPressed: () {
                          setState(() {
                            _mapZoom = (_mapZoom - 1).clamp(4, 19).toDouble();
                          });
                        },
                        child: const Icon(Icons.remove),
                      ),
                      const SizedBox(height: 8),
                      FloatingActionButton.small(
                        heroTag: 'owner-map-center',
                        onPressed: () {
                          final point = _washerLocation ?? _ownerLocation;
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
                      : Text(_requestId == null
                          ? 'Request Wash'
                          : 'Request Active'),
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
