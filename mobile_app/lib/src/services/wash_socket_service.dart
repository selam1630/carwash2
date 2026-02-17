import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

typedef WasherLocationHandler = void Function(Map<String, dynamic> data);
typedef WashEventHandler = void Function(Map<String, dynamic> data);

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

  void listenOwnerLocation(WashEventHandler onEvent) {
    _socket?.off('owner:location');
    _socket?.on('owner:location', (data) {
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

  void listenRequestCreated(WashEventHandler onEvent) {
    _socket?.off('request:created');
    _socket?.on('request:created', (data) {
      if (data is Map<String, dynamic>) {
        onEvent(data);
      } else if (data is Map) {
        onEvent(Map<String, dynamic>.from(data));
      }
    });
  }

  void listenRequestCompleted(WashEventHandler onEvent) {
    _socket?.off('request:completed');
    _socket?.on('request:completed', (data) {
      if (data is Map<String, dynamic>) {
        onEvent(data);
      } else if (data is Map) {
        onEvent(Map<String, dynamic>.from(data));
      }
    });
  }

  void listenCompletionRequested(WashEventHandler onEvent) {
    _socket?.off('request:completion-requested');
    _socket?.on('request:completion-requested', (data) {
      if (data is Map<String, dynamic>) {
        onEvent(data);
      } else if (data is Map) {
        onEvent(Map<String, dynamic>.from(data));
      }
    });
  }

  void listenRequestReopened(WashEventHandler onEvent) {
    _socket?.off('request:reopened');
    _socket?.on('request:reopened', (data) {
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

  void sendOwnerLocation({
    required String requestId,
    required double lat,
    required double lng,
  }) {
    _socket?.emit('owner:location', {
      'requestId': requestId,
      'lat': lat,
      'lng': lng,
    });
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
