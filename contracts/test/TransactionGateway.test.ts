import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockUSDC, TransactionGateway } from "../typechain-types";

describe("TransactionGateway", () => {
  let deployer: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let token: MockUSDC;
  let gateway: TransactionGateway;

  const FUNDING = 1_000_000n * 10n ** 6n;
  const nocHash = ethers.keccak256(ethers.toUtf8Bytes("sample-noc-document"));

  beforeEach(async () => {
    [deployer, verifier, stranger, recipient] = await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    token = (await MockUSDCFactory.deploy(deployer.address)) as unknown as MockUSDC;
    await token.waitForDeployment();

    const GatewayFactory = await ethers.getContractFactory("TransactionGateway");
    gateway = (await GatewayFactory.deploy(
      await token.getAddress(),
      verifier.address,
      deployer.address
    )) as unknown as TransactionGateway;
    await gateway.waitForDeployment();

    await token.mint(await gateway.getAddress(), FUNDING);
  });

  it("rejects executeTransfer from a non-verifier caller", async () => {
    await expect(
      gateway
        .connect(stranger)
        .executeTransfer(recipient.address, 100n, "Karachi", "Dubai", nocHash)
    ).to.be.revertedWithCustomError(gateway, "NotVerifier");
  });

  it("executes a transfer and emits an audit event when called by the verifier", async () => {
    const amount = 500n * 10n ** 6n;

    await expect(
      gateway
        .connect(verifier)
        .executeTransfer(recipient.address, amount, "Karachi", "Dubai", nocHash)
    )
      .to.emit(gateway, "TransferExecuted")
      .withArgs(0n, recipient.address, amount, "Karachi", "Dubai", nocHash);

    expect(await token.balanceOf(recipient.address)).to.equal(amount);

    const record = await gateway.transfers(0n);
    expect(record.recipient).to.equal(recipient.address);
    expect(record.originCity).to.equal("Karachi");
    expect(record.destCity).to.equal("Dubai");
    expect(record.nocDocHash).to.equal(nocHash);
  });

  it("rejects a zero amount or zero-address recipient", async () => {
    await expect(
      gateway.connect(verifier).executeTransfer(recipient.address, 0n, "A", "B", nocHash)
    ).to.be.revertedWithCustomError(gateway, "InvalidAmount");

    await expect(
      gateway
        .connect(verifier)
        .executeTransfer(ethers.ZeroAddress, 100n, "A", "B", nocHash)
    ).to.be.revertedWithCustomError(gateway, "InvalidRecipient");
  });

  it("lets the owner rotate the verifier address", async () => {
    await gateway.connect(deployer).setVerifier(stranger.address);
    expect(await gateway.verifier()).to.equal(stranger.address);

    await expect(
      gateway
        .connect(verifier)
        .executeTransfer(recipient.address, 100n, "A", "B", nocHash)
    ).to.be.revertedWithCustomError(gateway, "NotVerifier");
  });
});
