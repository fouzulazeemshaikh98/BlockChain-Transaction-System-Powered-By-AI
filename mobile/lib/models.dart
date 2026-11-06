class RecipientWallet {
  RecipientWallet({required this.label, required this.address, required this.city, required this.country});

  final String label;
  final String address;
  final String city;
  final String country;

  factory RecipientWallet.fromJson(Map<String, dynamic> j) => RecipientWallet(
        label: j['label'] as String? ?? '',
        address: j['address'] as String? ?? '',
        city: j['city'] as String? ?? '',
        country: j['country'] as String? ?? '',
      );
}

class TransferRequest {
  TransferRequest({required this.receiver, required this.amount, required this.pin});

  final String receiver;
  final double amount;
  final String pin;

  Map<String, dynamic> toJson() => {'receiver': receiver, 'amount': amount, 'pin': pin};
}

/// Outcome of POST /api/transfers: 202 = approved and submitted to Layer-2,
/// 422 = blocked by the AI risk engine.
class TransferResult {
  TransferResult.accepted(this.transferId, this.txHash, this.riskScore)
      : blocked = false,
        findings = const [];

  TransferResult.blocked(this.transferId, this.riskScore, this.findings)
      : blocked = true,
        txHash = null;

  final bool blocked;
  final String transferId;
  final String? txHash;
  final int riskScore;
  final List<String> findings;
}

class TransferSummary {
  TransferSummary({
    required this.transferId,
    required this.receiver,
    required this.amount,
    required this.riskScore,
    required this.status,
    required this.createdUtc,
    this.txHash,
  });

  final String transferId;
  final String receiver;
  final double amount;
  final int riskScore;
  final String status;
  final DateTime createdUtc;
  final String? txHash;

  factory TransferSummary.fromJson(Map<String, dynamic> j) => TransferSummary(
        transferId: j['transferId'] as String,
        receiver: (j['receiverLabel'] ?? j['receiver']) as String,
        amount: (j['amount'] as num).toDouble(),
        riskScore: j['riskScore'] as int,
        status: j['status'] as String,
        createdUtc: DateTime.parse(j['createdUtc'] as String),
        txHash: j['l2TxHash'] as String?,
      );
}

class TransferException implements Exception {
  TransferException(this.message);
  final String message;
  @override
  String toString() => message;
}
