import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

typedef WasherLocationHandler = void Function(Map<String, dynamic> data);

class WashSocketService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  io.Socket? _socket;

  Future<void> connect() async {
    if (_socket?.connected == true) return;

    final token = await _storage.read(key: 'access_token');
    final baseUrl = dotenv.env['FLUTTER_API_BASE_URL'] ?? 'http://localhost:3000';
    final uri = Uri.parse(baseUrl);
    final socketBase = '${uri.scheme}://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}/wash';

    _socket = io.io(
      socketBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token != null ? 'Bearer $token' : ''})
          .build(),
    );

    _socket?.connect();
  }

  void listenWasherLocation(WasherLocationHandler onEvent) {
    _socket?.off('washer:location');
    _socket?.on('washer:location', (data) {
      if (data is Map<String, dynamic>) {
        onEvent(data);
      } else if (data is Map) {
        onEvent(Map<String, dynamic>.from(data));
      }
    });
  }

  void listenRequestAccepted(void Function(Map<String, dynamic>) onEvent) {
    _socket?.off('request:accepted');
    _socket?.on('request:accepted', (data) {
      if (data is Map<String, dynamic>) {
        onEvent(data);
      } else if (data is Map) {
        onEvent(Map<String, dynamic>.from(data));
      }
    });
  }

  void joinRequest(String requestId) {
    _socket?.emit('request:join', {'requestId': requestId});
  }

  void sendWasherLocation({
    required String requestId,
    required double lat,
    required double lng,
    double? heading,
    double? speed,
  }) {
    _socket?.emit('washer:location', {
      'requestId': requestId,
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
      if (speed != null) 'speed': speed,
    });
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
