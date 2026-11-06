import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockUSDC, RiskGatedSettlement } from "../typechain-types";

describe("RiskGatedSettlement", () => {
  let owner: HardhatEthersSigner;
  let oracle: HardhatEthersSigner;
  let payer: HardhatEthersSigner;
  let receiver: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let token: MockUSDC;
  let settlement: RiskGatedSettlement;

  const AMOUNT = 250n * 10n ** 6n;

  // Mirrors the digest the FastAPI risk engine signs (ai-engine/services/attestation_service.py).
  async function attest(
    signer: HardhatEthersSigner,
    opts: { from?: string; to?: string; amount?: bigint; id?: string; score: number; expiry: bigint }
  ) {
    const { chainId } = await ethers.provider.getNetwork();
    const digest = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "address", "address", "address", "uint256", "bytes32", "uint8", "uint256"],
        [
          chainId,
          await settlement.getAddress(),
          opts.from ?? payer.address,
          await token.getAddress(),
          opts.to ?? receiver.address,
          opts.amount ?? AMOUNT,
          opts.id ?? ethers.id("transfer-1"),
          opts.score,
          opts.expiry,
        ]
      )
    );
    return signer.signMessage(ethers.getBytes(digest));
  }

  async function expiryIn(seconds: number) {
    return BigInt((await time.latest()) + seconds);
  }

  beforeEach(async () => {
    [owner, oracle, payer, receiver, stranger] = await ethers.getSigners();

    token = (await (await ethers.getContractFactory("MockUSDC")).deploy(owner.address)) as unknown as MockUSDC;
    settlement = (await (
      await ethers.getContractFactory("RiskGatedSettlement")
    ).deploy(oracle.address)) as unknown as RiskGatedSettlement;

    await token.mint(payer.address, 1_000_000n * 10n ** 6n);
    await token.connect(payer).approve(await settlement.getAddress(), ethers.MaxUint256);
  });

  it("settles a transfer with a valid low-risk attestation", async () => {
    const id = ethers.id("transfer-1");
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 12, expiry, id });

    await expect(
      settlement.connect(payer).settle(await token.getAddress(), receiver.address, AMOUNT, id, 12, expiry, sig)
    )
      .to.emit(settlement, "Settled")
      .withArgs(id, payer.address, receiver.address, AMOUNT, 12);

    expect(await token.balanceOf(receiver.address)).to.equal(AMOUNT);
    expect(await settlement.executed(id)).to.equal(true);
  });

  it("blocks (emits Blocked, moves no funds) when the score is above the threshold", async () => {
    const id = ethers.id("transfer-high");
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 73, expiry, id });

    await expect(
      settlement.connect(payer).settle(await token.getAddress(), receiver.address, AMOUNT, id, 73, expiry, sig)
    ).to.emit(settlement, "Blocked");

    expect(await token.balanceOf(receiver.address)).to.equal(0n);
  });

  it("treats exactly 40 as approved (blocks only when score > 40)", async () => {
    const id = ethers.id("transfer-40");
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 40, expiry, id });
    await expect(
      settlement.connect(payer).settle(await token.getAddress(), receiver.address, AMOUNT, id, 40, expiry, sig)
    ).to.emit(settlement, "Settled");
  });

  it("rejects an attestation not signed by the risk oracle", async () => {
    const expiry = await expiryIn(120);
    const sig = await attest(stranger, { score: 5, expiry });
    await expect(
      settlement
        .connect(payer)
        .settle(await token.getAddress(), receiver.address, AMOUNT, ethers.id("transfer-1"), 5, expiry, sig)
    ).to.be.revertedWith("Invalid risk attestation");
  });

  it("rejects an expired attestation", async () => {
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 5, expiry });
    await time.increase(121);
    await expect(
      settlement
        .connect(payer)
        .settle(await token.getAddress(), receiver.address, AMOUNT, ethers.id("transfer-1"), 5, expiry, sig)
    ).to.be.revertedWith("Attestation expired");
  });

  it("rejects replaying the same transfer id", async () => {
    const id = ethers.id("transfer-1");
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 5, expiry, id });
    const tokenAddr = await token.getAddress();
    await settlement.connect(payer).settle(tokenAddr, receiver.address, AMOUNT, id, 5, expiry, sig);
    await expect(
      settlement.connect(payer).settle(tokenAddr, receiver.address, AMOUNT, id, 5, expiry, sig)
    ).to.be.revertedWith("Transfer already processed");
  });

  it("rejects an attestation whose fields were altered (amount, receiver, score or sender)", async () => {
    const id = ethers.id("transfer-1");
    const expiry = await expiryIn(120);
    const sig = await attest(oracle, { score: 5, expiry, id });
    const tokenAddr = await token.getAddress();

    await expect(
      settlement.connect(payer).settle(tokenAddr, receiver.address, AMOUNT * 2n, id, 5, expiry, sig)
    ).to.be.revertedWith("Invalid risk attestation");
    await expect(
      settlement.connect(payer).settle(tokenAddr, stranger.address, AMOUNT, id, 5, expiry, sig)
    ).to.be.revertedWith("Invalid risk attestation");
    await expect(
      settlement.connect(payer).settle(tokenAddr, receiver.address, AMOUNT, id, 0, expiry, sig)
    ).to.be.revertedWith("Invalid risk attestation");
    // Same attestation submitted from a different wallet: digest binds msg.sender.
    await token.mint(stranger.address, AMOUNT);
    await token.connect(stranger).approve(await settlement.getAddress(), AMOUNT);
    await expect(
      settlement.connect(stranger).settle(tokenAddr, receiver.address, AMOUNT, id, 5, expiry, sig)
    ).to.be.revertedWith("Invalid risk attestation");
  });

  it("lets only the owner change the oracle and threshold", async () => {
    await expect(settlement.connect(stranger).setRiskOracle(stranger.address)).to.be.revertedWithCustomError(
      settlement,
      "OwnableUnauthorizedAccount"
    );
    await expect(settlement.setMaxRiskScore(101)).to.be.revertedWith("Score out of range");
    await settlement.setMaxRiskScore(60);
    expect(await settlement.maxRiskScore()).to.equal(60);
  });
});
