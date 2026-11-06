import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../models.dart';

/// Logs in against the ASP.NET Core backend and keeps the JWT in the
/// platform keystore. No blockchain keys are ever held by the app.
class AuthService {
  AuthService(this._client, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final http.Client _client;
  final FlutterSecureStorage _storage;
  static const _tokenKey = 'jwt';
  static const _nameKey = 'full_name';

  Future<String> login(String email, String password) async {
    final res = await _client.post(
      Uri.parse('$apiBaseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw TransferException(res.body.isNotEmpty ? res.body.replaceAll('"', '') : 'Login failed (${res.statusCode})');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    await _storage.write(key: _tokenKey, value: body['token'] as String);
    await _storage.write(key: _nameKey, value: body['fullName'] as String? ?? '');
    return body['fullName'] as String? ?? '';
  }

  Future<String?> getJwt() => _storage.read(key: _tokenKey);
  Future<String?> getName() => _storage.read(key: _nameKey);

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _nameKey);
  }
}
