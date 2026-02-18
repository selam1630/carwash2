import 'dart:html' as html;

const bool isSessionKvAvailable = true;

String? sessionRead(String key) {
  return html.window.sessionStorage[key];
}

void sessionWrite(String key, String value) {
  html.window.sessionStorage[key] = value;
}

void sessionDelete(String key) {
  html.window.sessionStorage.remove(key);
}
