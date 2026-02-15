import 'dart:async';

import 'package:geolocator/geolocator.dart';

import 'wash_socket_service.dart';

class WasherLiveTrackingService {
  final WashSocketService _socket;
  StreamSubscription<Position>? _positionSub;
  DateTime _lastSentAt = DateTime.fromMillisecondsSinceEpoch(0);

  WasherLiveTrackingService(this._socket);

  Future<void> start({required String requestId}) async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) return;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }

    await _socket.connect();
    _socket.joinRequest(requestId);

    _positionSub?.cancel();
    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      ),
    ).listen((position) {
      final now = DateTime.now();
      if (now.difference(_lastSentAt).inSeconds < 4) {
        return;
      }
      _lastSentAt = now;
      _socket.sendWasherLocation(
        requestId: requestId,
        lat: position.latitude,
        lng: position.longitude,
        heading: position.heading,
        speed: position.speed,
      );
    });
  }

  Future<void> stop() async {
    await _positionSub?.cancel();
    _positionSub = null;
  }
}
