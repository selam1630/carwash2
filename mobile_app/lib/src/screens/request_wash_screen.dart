import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'dart:async';

import '../api/api_client.dart';
import '../services/wash_socket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/logout_action.dart';
import '../widgets/theme_mode_action.dart';

class RequestWashScreen extends StatefulWidget {
  const RequestWashScreen({super.key});

  @override
  State<RequestWashScreen> createState() => _RequestWashScreenState();
}

class _RequestWashScreenState extends State<RequestWashScreen> {
  static const String _gebetaDirectionsUrl =
      'https://mapapi.gebeta.app/api/route/direction/';
  static const String _voyagerMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  static const String _voyagerDarkMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  static const String _voyagerDarkSoftMapUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
  static const List<String> _mapSubdomains = ['a', 'b', 'c'];
  final ApiClient _api = ApiClient();
  final WashSocketService _socket = WashSocketService();
  final MapController _mapController = MapController();

  LatLng? _ownerLocation;
  LatLng? _washerLocation;
  LatLng? _mapCenter;
  List<_NearbyWasher> _nearbyWashers = [];
  String? _selectedNearbyWasherId;
  String? _requestId;
  String? _activeRequestStatus;
  bool _activeHasBeforePhoto = false;
  String _status = 'Ready to request a wash';
  bool _loading = false;
  double _mapZoom = 15;
  bool _highContrastMap = true;
  bool _didInitialNearbyFocus = false;
  Timer? _nearbyTimer;
  StreamSubscription<Position>? _ownerPositionSub;
  List<LatLng> _ownerTrail = [];
  List<LatLng> _washerTrail = [];
  List<LatLng> _routeToWasher = [];
  int? _etaMinutes;
  DateTime? _lastRouteFetchAt;
  bool _completionDialogOpen = false;

  String? _gebetaTileTemplate({required bool isDark, required bool highContrast}) {
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

  _ParsedRoute _extractRoute(dynamic payload) {
    if (payload is! Map) {
      return const _ParsedRoute(points: <LatLng>[], etaMinutes: null);
    }

    dynamic candidate;
    if (payload['routes'] is List && (payload['routes'] as List).isNotEmpty) {
      candidate = (payload['routes'] as List).first;
    } else if (payload['route'] is Map) {
      candidate = payload['route'];
    } else if (payload['data'] is Map) {
      final data = payload['data'];
      if (data['routes'] is List && (data['routes'] as List).isNotEmpty) {
        candidate = (data['routes'] as List).first;
      } else if (data['route'] is Map) {
        candidate = data['route'];
      }
    }

    if (candidate is! Map) {
      return const _ParsedRoute(points: <LatLng>[], etaMinutes: null);
    }

    final points = <LatLng>[];
    dynamic coords;
    final geometry = candidate['geometry'];
    if (geometry is Map) {
      coords = geometry['coordinates'] ?? geometry['paths'];
    } else if (geometry is List) {
      coords = geometry;
    } else {
      coords = candidate['coordinates'] ?? candidate['path'];
    }

    if (coords is List) {
      for (final c in coords) {
        if (c is List && c.length >= 2) {
          final a = _asDouble(c[0]);
          final b = _asDouble(c[1]);
          if (a == null || b == null) continue;
          // Most APIs return [lng, lat], but tolerate [lat, lng] too.
          final looksLikeLngLat = a.abs() > 20 || b.abs() < 20;
          final lat = looksLikeLngLat ? b : a;
          final lng = looksLikeLngLat ? a : b;
          points.add(LatLng(lat, lng));
        } else if (c is Map) {
          final lat = _asDouble(c['lat'] ?? c['latitude']);
          final lng = _asDouble(c['lng'] ?? c['lon'] ?? c['longitude']);
          if (lat != null && lng != null) {
            points.add(LatLng(lat, lng));
          }
        }
      }
    }

    final durationRaw = candidate['duration'] ??
        candidate['durationInSec'] ??
        candidate['durationInSeconds'] ??
        payload['duration'];
    int? etaMinutes;
    final duration = _asDouble(durationRaw);
    if (duration != null && duration > 0) {
      // Gebeta docs sometimes use seconds; if small value, treat as minutes.
      final minutes = duration > 180 ? (duration / 60) : duration;
      etaMinutes = minutes.ceil();
    }

    return _ParsedRoute(points: points, etaMinutes: etaMinutes);
  }

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
        _activeRequestStatus = 'ACCEPTED';
        if (acceptedLocation != null) {
          _washerLocation = acceptedLocation;
        }
      });
    });

    _socket.listenRequestStarted((event) {
      if (_requestId == null || event['requestId'] != _requestId) return;
      setState(() {
        _activeRequestStatus = (event['status'] ?? 'IN_PROGRESS').toString();
        _activeHasBeforePhoto = true;
        _status = 'Wash started. You can no longer cancel this request.';
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
      _updateRouteAndEta();
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
        _activeRequestStatus = null;
        _activeHasBeforePhoto = false;
        _routeToWasher = [];
        _etaMinutes = null;
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
        _activeRequestStatus = 'REQUESTED';
        _activeHasBeforePhoto = false;
        _washerLocation = null;
        _washerTrail = [];
        _routeToWasher = [];
        _etaMinutes = null;
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
        final activeStatus = (active['status'] ?? '').toString();
        final beforePhoto = active['beforeWashPhoto'];
        setState(() {
          _requestId = activeId;
          _status = 'You have an active wash request';
          _activeRequestStatus = activeStatus;
          _activeHasBeforePhoto =
              beforePhoto != null && beforePhoto.toString().trim().isNotEmpty;
        });
        _socket.joinRequest(activeId);

        final lat = _asDouble(active['washerLat']);
        final lng = _asDouble(active['washerLng']);
        if (lat != null && lng != null) {
          setState(() {
            _washerLocation = LatLng(lat, lng);
            _appendTrail(_washerTrail, _washerLocation!);
          });
          _updateRouteAndEta(force: true);
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
          final name = it['name']?.toString();
          final phone = it['phone']?.toString();
          final photo = it['photo']?.toString();
          if (washerId != null &&
              washerId.isNotEmpty &&
              lat != null &&
              lng != null) {
            washers.add(_NearbyWasher(
              washerId: washerId,
              lat: lat,
              lng: lng,
              name: name,
              phone: phone,
              photo: photo,
            ));
          }
        }
      }
      if (_ownerLocation != null && washers.isNotEmpty) {
        final owner = _ownerLocation!;
        washers.sort((a, b) {
          final da = (owner.latitude - a.lat) * (owner.latitude - a.lat) +
              (owner.longitude - a.lng) * (owner.longitude - a.lng);
          final db = (owner.latitude - b.lat) * (owner.latitude - b.lat) +
              (owner.longitude - b.lng) * (owner.longitude - b.lng);
          return da.compareTo(db);
        });
      }
      if (!mounted) return;
      setState(() {
        _nearbyWashers = washers;
        if (washers.isEmpty) {
          _selectedNearbyWasherId = null;
        } else if (_selectedNearbyWasherId == null ||
            !washers.any((w) => w.washerId == _selectedNearbyWasherId)) {
          _selectedNearbyWasherId = washers.first.washerId;
        }
      });
      _focusNearbyCluster();
    } catch (_) {
      // ignore polling errors
    }
  }

  void _focusNearbyCluster({bool force = false}) {
    final shouldMoveNow = !_didInitialNearbyFocus || force;
    if (_didInitialNearbyFocus && !force) return;
    if (_nearbyWashers.isEmpty) return;

    // Focus nearest biker first so biker symbols appear immediately.
    var anchor = _nearbyWashers.first;
    if (_ownerLocation != null) {
      final owner = _ownerLocation!;
      var bestScore = double.infinity;
      for (final w in _nearbyWashers) {
        final dLat = owner.latitude - w.lat;
        final dLng = owner.longitude - w.lng;
        final score = dLat * dLat + dLng * dLng;
        if (score < bestScore) {
          bestScore = score;
          anchor = w;
        }
      }
    }

    var minLat = anchor.lat;
    var maxLat = anchor.lat;
    var minLng = anchor.lng;
    var maxLng = anchor.lng;

    for (final w in _nearbyWashers) {
      if (w.lat < minLat) minLat = w.lat;
      if (w.lat > maxLat) maxLat = w.lat;
      if (w.lng < minLng) minLng = w.lng;
      if (w.lng > maxLng) maxLng = w.lng;
    }

    final center = LatLng(anchor.lat, anchor.lng);
    final latDelta = (maxLat - minLat).abs();
    final lngDelta = (maxLng - minLng).abs();
    final span = latDelta > lngDelta ? latDelta : lngDelta;

    double zoom;
    if (_nearbyWashers.length == 1) {
      zoom = 17.9;
    } else if (span < 0.002) {
      zoom = 17.4;
    } else if (span < 0.005) {
      zoom = 16.8;
    } else if (span < 0.012) {
      zoom = 16.0;
    } else {
      zoom = 15.0;
    }

    if (!mounted) return;
    setState(() {
      _mapCenter = center;
      _mapZoom = zoom;
      _didInitialNearbyFocus = true;
    });
    if (shouldMoveNow) {
      _moveMap(center, zoom);
    }
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
        _updateRouteAndEta();
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
        _activeRequestStatus = 'REQUESTED';
        _activeHasBeforePhoto = false;
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

  Future<void> _cancelRequest() async {
    final requestId = _requestId;
    if (requestId == null || requestId.isEmpty) return;

    setState(() => _loading = true);
    try {
      await _api.cancelWashRequest(requestId);
      if (!mounted) return;
      setState(() {
        _requestId = null;
        _activeRequestStatus = null;
        _activeHasBeforePhoto = false;
        _washerLocation = null;
        _washerTrail = [];
        _routeToWasher = [];
        _etaMinutes = null;
        _status = 'Request cancelled';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Request cancelled successfully.')),
      );
    } catch (e) {
      String message = '$e';
      if (e is DioException) {
        final data = e.response?.data;
        if (data is Map && data['message'] != null) {
          final m = data['message'];
          message = m is List ? m.join(', ') : m.toString();
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cancel failed: $message')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
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
    _moveMap(point, _mapZoom);
  }

  String? _buildPhotoUrl(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    // Skip Google "imgres" proxy URLs which are not direct images.
    if (trimmed.contains('google.com/imgres')) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    final base = _api.dio.options.baseUrl.trim();
    if (base.isEmpty) return trimmed;
    if (trimmed.startsWith('/')) {
      return '$base$trimmed';
    }
    return '$base/$trimmed';
  }

  Widget _buildWasherAvatar({
    required bool isDark,
    required String? photoUrl,
  }) {
    final fallback = Icon(Icons.pedal_bike, color: AppTheme.brandNavy);
    if (photoUrl == null) {
      return CircleAvatar(
        radius: 22,
        backgroundColor:
            isDark ? const Color(0xFF111B33) : const Color(0xFFE8EEF8),
        child: fallback,
      );
    }
    return CircleAvatar(
      radius: 22,
      backgroundColor:
          isDark ? const Color(0xFF111B33) : const Color(0xFFE8EEF8),
      child: ClipOval(
        child: Image.network(
          photoUrl,
          width: 44,
          height: 44,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => fallback,
        ),
      ),
    );
  }

  void _moveMap(LatLng center, double zoom) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      try {
        _mapController.move(center, zoom);
      } catch (_) {}
    });
  }

  Future<void> _updateRouteAndEta({bool force = false}) async {
    final owner = _ownerLocation;
    final washer = _washerLocation;
    if (owner == null || washer == null) return;

    final now = DateTime.now();
    if (!force &&
        _lastRouteFetchAt != null &&
        now.difference(_lastRouteFetchAt!).inSeconds < 12) {
      return;
    }
    _lastRouteFetchAt = now;

    final gebetaToken = dotenv.env['FLUTTER_GEBETA_API_TOKEN']?.trim() ?? '';

    try {
      if (gebetaToken.isNotEmpty) {
        final resp = await Dio().get(
          _gebetaDirectionsUrl,
          queryParameters: {
            'origin': '{${owner.latitude},${owner.longitude}}',
            'destination': '{${washer.latitude},${washer.longitude}}',
            'apiKey': gebetaToken,
          },
        );
        final parsed = _extractRoute(resp.data);
        if (parsed.points.length > 1 && mounted) {
          setState(() {
            _routeToWasher = parsed.points;
            _etaMinutes = parsed.etaMinutes;
          });
          return;
        }
      }

      // Fallback route provider so map UX stays stable even if Gebeta response shape changes.
      final url = 'https://router.project-osrm.org/route/v1/driving/'
          '${owner.longitude},${owner.latitude};${washer.longitude},${washer.latitude}'
          '?overview=full&geometries=geojson';
      final resp = await Dio().get(url);
      final parsed = _extractRoute(resp.data);
      if (!mounted) return;
      setState(() {
        _routeToWasher = parsed.points;
        _etaMinutes = parsed.etaMinutes;
      });
    } catch (_) {
      // Keep app responsive if routing service is unavailable.
    }
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
          _routeToWasher = [];
          _etaMinutes = null;
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
          _routeToWasher = [];
          _etaMinutes = null;
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fallbackMapUrl = isDark
        ? (_highContrastMap
            ? _voyagerDarkMapUrlTemplate
            : _voyagerDarkSoftMapUrlTemplate)
        : _voyagerMapUrlTemplate;
    final gebetaMapTemplate = _useGebetaTiles()
        ? _gebetaTileTemplate(isDark: isDark, highContrast: _highContrastMap)
        : null;
    final candidateMapUrl =
        _injectGebetaToken(gebetaMapTemplate ?? fallbackMapUrl);
    final hasRequiredPlaceholders = candidateMapUrl.contains('{z}') &&
        candidateMapUrl.contains('{x}') &&
        candidateMapUrl.contains('{y}');
    final mapUrl = hasRequiredPlaceholders ? candidateMapUrl : fallbackMapUrl;
    final mapUsesSubdomains = mapUrl.contains('{s}');
    final center = _mapCenter ??
        ((_requestId == null && _nearbyWashers.isNotEmpty)
            ? LatLng(_nearbyWashers.first.lat, _nearbyWashers.first.lng)
            : _ownerLocation) ??
        LatLng(9.03, 38.74);
    final nearbyCount = _nearbyWashers.length;
    final activeStatus = (_activeRequestStatus ?? '').toUpperCase();
    final canCancel =
        _requestId != null &&
        !(_activeHasBeforePhoto || activeStatus == 'IN_PROGRESS');
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
          width: 110,
          height: 78,
          builder: (_) => GestureDetector(
            onTap: () {
              setState(() => _selectedNearbyWasherId = w.washerId);
            },
            child: _buildLabeledMarker(
              icon: Icons.pedal_bike,
              color: isDark ? const Color(0xFF00E5FF) : AppTheme.brandCyan,
              label: w.name?.trim().isNotEmpty == true ? w.name! : 'Nearby',
              size: 24,
              fillColor: isDark ? const Color(0xFF060A16) : null,
              labelFillColor: isDark ? const Color(0xFF060A16) : null,
              labelTextColor: isDark ? const Color(0xFFE6FBFF) : null,
            ),
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
        actions: const [ThemeModeAction(), LogoutAction()],
      ),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    center: center,
                    zoom: _mapZoom,
                    minZoom: 4,
                    maxZoom: 19,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: mapUrl,
                      subdomains: mapUsesSubdomains ? _mapSubdomains : const [],
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
                    if (_routeToWasher.length > 1)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _routeToWasher,
                            strokeWidth: 6,
                            color: isDark
                                ? const Color(0xFFFFC107)
                                : const Color(0xFFFF8F00),
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
                      color: isDark
                          ? const Color(0xFF0A1020).withOpacity(0.92)
                          : Colors.white.withOpacity(0.92),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF294180)
                            : const Color(0xFFD6DEF0),
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Legend',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.person_pin_circle,
                                color: AppTheme.brandNavy, size: 18),
                            const SizedBox(width: 8),
                            Text('You',
                                style: TextStyle(
                                    color: isDark
                                        ? Colors.white
                                        : Colors.black87)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.pedal_bike,
                                color: AppTheme.brandCyan, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Nearby washers ($nearbyCount)',
                              style: TextStyle(
                                  color:
                                      isDark ? Colors.white : Colors.black87),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.delivery_dining,
                                color: Colors.green, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Assigned washer',
                              style: TextStyle(
                                  color:
                                      isDark ? Colors.white : Colors.black87),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.timeline,
                                color: AppTheme.brandNavy, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Your path',
                              style: TextStyle(
                                  color:
                                      isDark ? Colors.white : Colors.black87),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.timeline,
                                color: Colors.green, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Washer path',
                              style: TextStyle(
                                  color:
                                      isDark ? Colors.white : Colors.black87),
                            ),
                          ],
                        ),
                        if (_etaMinutes != null) const SizedBox(height: 4),
                        if (_etaMinutes != null)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.schedule,
                                  color: Color(0xFFFFA000), size: 18),
                              const SizedBox(width: 8),
                              Text(
                                'ETA: $_etaMinutes min',
                                style: TextStyle(
                                    color:
                                        isDark ? Colors.white : Colors.black87),
                              ),
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
                if (_selectedNearbyWasherId != null)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: Builder(
                      builder: (_) {
                        final selected = _nearbyWashers.firstWhere(
                          (w) => w.washerId == _selectedNearbyWasherId,
                          orElse: () => _nearbyWashers.first,
                        );
                        final photoUrl = _buildPhotoUrl(selected.photo);
                        return Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0A1020).withOpacity(0.95)
                                : Colors.white.withOpacity(0.96),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF294180)
                                  : const Color(0xFFD6DEF0),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.15),
                                blurRadius: 12,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              _buildWasherAvatar(
                                isDark: isDark,
                                photoUrl: photoUrl,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      selected.name?.trim().isNotEmpty == true
                                          ? selected.name!
                                          : 'Nearby washer',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: isDark
                                            ? Colors.white
                                            : Colors.black87,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      selected.phone?.trim().isNotEmpty == true
                                          ? selected.phone!
                                          : 'Phone unavailable',
                                      style: TextStyle(
                                        color: isDark
                                            ? Colors.white70
                                            : Colors.black54,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              IconButton(
                                onPressed: () {
                                  setState(() => _selectedNearbyWasherId = null);
                                },
                                icon: Icon(
                                  Icons.close,
                                  color: isDark ? Colors.white70 : Colors.black54,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
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
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: _loading || _requestId != null ? null : _requestWash,
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
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _loading || !canCancel ? null : _cancelRequest,
                        child: const Text('Cancel Request'),
                      ),
                    ),
                  ],
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
  final String? name;
  final String? phone;
  final String? photo;

  _NearbyWasher({
    required this.washerId,
    required this.lat,
    required this.lng,
    this.name,
    this.phone,
    this.photo,
  });
}

class _ParsedRoute {
  final List<LatLng> points;
  final int? etaMinutes;

  const _ParsedRoute({
    required this.points,
    required this.etaMinutes,
  });
}
