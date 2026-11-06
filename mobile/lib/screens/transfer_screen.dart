import 'package:flutter/material.dart';

import '../models.dart';
import '../services/transfer_service.dart';

class TransferScreen extends StatefulWidget {
  const TransferScreen({super.key, required this.transfers});

  final TransferService transfers;

  @override
  State<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends State<TransferScreen> {
  final _amount = TextEditingController();
  final _pin = TextEditingController();
  List<RecipientWallet> _recipients = [];
  RecipientWallet? _selected;
  bool _busy = false;
  String? _error;
  TransferResult? _result;

  @override
  void initState() {
    super.initState();
    widget.transfers.fetchRecipients().then((list) {
      if (!mounted) return;
      setState(() {
        _recipients = list;
        _selected = list.isNotEmpty ? list.first : null;
      });
    }).catchError((e) {
      if (mounted) setState(() => _error = e.toString());
    });
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amount.text.trim());
    if (_selected == null || amount == null || amount <= 0 || _pin.text.isEmpty) {
      setState(() => _error = 'Choose a recipient, enter an amount and your PIN.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final result = await widget.transfers
          .submitTransfer(TransferRequest(receiver: _selected!.address, amount: amount, pin: _pin.text));
      setState(() => _result = result);
      _pin.clear();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DropdownButtonFormField<RecipientWallet>(
          value: _selected,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Recipient', border: OutlineInputBorder()),
          items: _recipients
              .map((w) => DropdownMenuItem(value: w, child: Text('${w.label} - ${w.city}', overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (w) => setState(() => _selected = w),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Amount (mUSDC)', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _pin,
          obscureText: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Transfer PIN', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : _submit,
          icon: _busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.verified_user_outlined),
          label: Text(_busy ? 'Scoring and settling...' : 'Score and Settle'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        if (_result != null) ...[const SizedBox(height: 16), _ResultCard(result: _result!)],
      ],
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final TransferResult result;

  @override
  Widget build(BuildContext context) {
    final blocked = result.blocked;
    final color = blocked ? Colors.red.shade700 : Colors.green.shade700;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(blocked ? Icons.gpp_bad_outlined : Icons.check_circle_outline, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  blocked ? 'Blocked by AI risk engine' : 'Approved and settled',
                  style: TextStyle(color: color, fontWeight: FontWeight.bold),
                ),
              ),
              Text('Risk ${result.riskScore}/100', style: TextStyle(color: color)),
            ]),
            const SizedBox(height: 8),
            SelectableText('Transfer ID: ${result.transferId}', style: const TextStyle(fontSize: 12)),
            if (result.txHash != null) SelectableText('Tx: ${result.txHash}', style: const TextStyle(fontSize: 12)),
            for (final f in result.findings)
              Padding(padding: const EdgeInsets.only(top: 6), child: Text('• $f')),
          ],
        ),
      ),
    );
  }
}
