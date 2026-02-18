import 'session_kv_stub.dart'
    if (dart.library.html) 'session_kv_web.dart' as impl;

bool get isSessionKvAvailable => impl.isSessionKvAvailable;

String? sessionRead(String key) => impl.sessionRead(key);

void sessionWrite(String key, String value) => impl.sessionWrite(key, value);

void sessionDelete(String key) => impl.sessionDelete(key);
