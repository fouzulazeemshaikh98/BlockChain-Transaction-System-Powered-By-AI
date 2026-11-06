import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models.dart';
import 'auth_service.dart';

class TransferService {
  TransferService(this._client, this._auth);

  final http.Client _client;
  final AuthService _auth;

  Future<Map<String, String>> _headers() async {
    final token = await _auth.getJwt(); // JWT issued by the backend
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  /// Sends a transfer to the backend; no keys are ever stored in the app.
  Future<TransferResult> submitTransfer(TransferRequest req) async {
    final res = await _client.post(
      Uri.parse('$apiBaseUrl/api/transfers'),
      headers: await _headers(),
      body: jsonEncode(req.toJson()),
    );
    final body = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    switch (res.statusCode) {
      case 202: // approved and submitted to Layer-2
        return TransferResult.accepted(body['transferId'], body['txHash'], body['riskScore']);
      case 422: // blocked by the AI risk engine
        return TransferResult.blocked(
            body['transferId'], body['riskScore'], List<String>.from(body['findings'] ?? const []));
      case 401:
        throw TransferException((body is Map && body['message'] != null) ? body['message'] : 'Session expired or wrong PIN.');
      default:
        final msg = body is Map ? (body['message'] ?? body['detail']) : null;
        throw TransferException('Transfer failed (${res.statusCode})${msg != null ? ': $msg' : ''}');
    }
  }

  Future<List<RecipientWallet>> fetchRecipients() async {
    final res = await _client.get(Uri.parse('$apiBaseUrl/api/wallets'), headers: await _headers());
    if (res.statusCode != 200) throw TransferException('Could not load recipients (${res.statusCode})');
    return (jsonDecode(res.body) as List).map((j) => RecipientWallet.fromJson(j)).toList();
  }

  Future<List<TransferSummary>> fetchHistory() async {
    final res = await _client.get(Uri.parse('$apiBaseUrl/api/transfers'), headers: await _headers());
    if (res.statusCode != 200) throw TransferException('Could not load history (${res.statusCode})');
    return (jsonDecode(res.body) as List).map((j) => TransferSummary.fromJson(j)).toList();
  }
}
