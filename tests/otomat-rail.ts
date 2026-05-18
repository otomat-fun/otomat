import * as fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { assert } from "chai";
import type { OtomatRail } from "../target/types/otomat_rail";

const BN = anchor.BN;
type BNType = anchor.BN;

const CHECK_PREFIX = Buffer.from("otomat/v2/check|");
// Keypair for the governance authority that signs `slash_facilitator`. Its
// pubkey must equal GOVERNANCE_PUBKEY in the program. Override with the
// GOVERNANCE_KEYPAIR env var; defaults to the local Solana CLI wallet.
const GOVERNANCE_KEYPAIR_PATH =
  process.env.GOVERNANCE_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("otomat-rail", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Construct the program from the freshly built IDL (deterministic; no
  // dependence on workspace name casing).
  const idl = require("../target/idl/otomat_rail.json");
  const program = new anchor.Program(idl, provider) as Program<OtomatRail>;

  // Shared actors and asset.
  const payer = Keypair.generate();
  const facilitator = Keypair.generate();
  const operator = Keypair.generate();
  let mint: PublicKey;
  let payerAta: PublicKey;
  let operatorAta: PublicKey;

  const DEPOSIT = new BN(1_000_000); // 1.0 token @ 6 decimals

  // -- helpers --------------------------------------------------------------

  async function airdrop(pubkey: PublicKey, sol = 10) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  }

  async function chainNow(): Promise<number> {
    const slot = await connection.getSlot();
    const t = await connection.getBlockTime(slot);
    return t ?? Math.floor(Date.now() / 1000);
  }

  async function waitForChainTime(target: number) {
    for (let i = 0; i < 90; i++) {
      if ((await chainNow()) >= target) return;
      await sleep(1000);
    }
    throw new Error("timed out waiting for chain clock");
  }

  function channelPda(pyr: PublicKey, pye: PublicKey, mnt: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), pyr.toBuffer(), pye.toBuffer(), mnt.toBuffer()],
      program.programId
    )[0];
  }

  function escrowAuthPda(channel: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_auth"), channel.toBuffer()],
      program.programId
    )[0];
  }

  function checkMessage(
    channel: PublicKey,
    cumulative: BNType,
    nonce: BNType,
    expiry: BNType
  ): Buffer {
    return Buffer.concat([
      CHECK_PREFIX,
      channel.toBuffer(),
      cumulative.toArrayLike(Buffer, "le", 8),
      nonce.toArrayLike(Buffer, "le", 8),
      expiry.toArrayLike(Buffer, "le", 8),
    ]);
  }

  async function openChannel(payee: PublicKey, deposit: BNType, expiry: BNType) {
    const channel = channelPda(payer.publicKey, payee, mint);
    const escrowAuthority = escrowAuthPda(channel);
    const escrowAta = getAssociatedTokenAddressSync(
      mint,
      escrowAuthority,
      true,
      TOKEN_PROGRAM_ID
    );
    await program.methods
      .openChannel(deposit, expiry, facilitator.publicKey)
      .accountsStrict({
        payer: payer.publicKey,
        payee,
        mint,
        channel,
        escrowAuthority,
        escrowAta,
        payerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
    return { channel, escrowAuthority, escrowAta };
  }

  function ed25519Ix(pubkey: PublicKey, message: Buffer, signature: Uint8Array) {
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: pubkey.toBytes(),
      message,
      signature,
    });
  }

  async function tokenBalance(ata: PublicKey): Promise<bigint> {
    return (await getAccount(connection, ata)).amount;
  }

  // -- setup ----------------------------------------------------------------

  before(async () => {
    await airdrop(payer.publicKey, 20);
    await airdrop(facilitator.publicKey, 20);
    await airdrop(operator.publicKey, 20);

    mint = await createMint(connection, payer, payer.publicKey, null, 6);

    payerAta = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey)
    ).address;
    operatorAta = (
      await getOrCreateAssociatedTokenAccount(connection, operator, mint, operator.publicKey)
    ).address;

    await mintTo(connection, payer, mint, payerAta, payer, 1_000_000_000);
    await mintTo(connection, payer, mint, operatorAta, payer, 5_000_000);
  });

  // -- 1. open_channel ------------------------------------------------------

  it("open_channel funds the escrow vault", async () => {
    const payee = Keypair.generate().publicKey;
    const expiry = new BN((await chainNow()) + 3600);
    const before = await tokenBalance(payerAta);

    const { channel, escrowAta } = await openChannel(payee, DEPOSIT, expiry);

    assert.equal((await tokenBalance(escrowAta)).toString(), DEPOSIT.toString());
    assert.equal(
      (await tokenBalance(payerAta)).toString(),
      (before - BigInt(DEPOSIT.toString())).toString()
    );

    const acc = await program.account.channel.fetch(channel);
    assert.equal(acc.payer.toBase58(), payer.publicKey.toBase58());
    assert.equal(acc.payee.toBase58(), payee.toBase58());
    assert.equal(acc.facilitator.toBase58(), facilitator.publicKey.toBase58());
    assert.equal(acc.deposit.toString(), DEPOSIT.toString());
    assert.equal(acc.nonce.toString(), "0");
    assert.deepEqual(acc.status, { open: {} });
  });

  // -- 2. close_channel (valid signature) -----------------------------------

  it("close_channel settles to payee and refunds the payer", async () => {
    const payee = Keypair.generate();
    const expiry = new BN((await chainNow()) + 3600);
    const { channel, escrowAuthority, escrowAta } = await openChannel(
      payee.publicKey,
      DEPOSIT,
      expiry
    );
    const payeeAta = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, payee.publicKey)
    ).address;

    const cumulative = new BN(400_000);
    const nonce = new BN(1);
    const refund = BigInt(DEPOSIT.sub(cumulative).toString());

    const msg = checkMessage(channel, cumulative, nonce, expiry);
    const sig = nacl.sign.detached(msg, payer.secretKey);

    const payerBefore = await tokenBalance(payerAta);
    await program.methods
      .closeChannel(cumulative, nonce, Array.from(sig))
      .accountsStrict({
        facilitator: facilitator.publicKey,
        channel,
        payer: payer.publicKey,
        payee: payee.publicKey,
        mint,
        escrowAuthority,
        escrowAta,
        payeeAta,
        payerAta,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([ed25519Ix(payer.publicKey, msg, sig)])
      .signers([facilitator])
      .rpc();

    assert.equal((await tokenBalance(payeeAta)).toString(), cumulative.toString());
    assert.equal(
      (await tokenBalance(payerAta)).toString(),
      (payerBefore + refund).toString()
    );
    assert.isNull(await program.account.channel.fetchNullable(channel));
  });

  // -- 3. close_channel (invalid signature) ---------------------------------

  it("close_channel rejects a check signed by a non-payer", async () => {
    const payee = Keypair.generate();
    const expiry = new BN((await chainNow()) + 3600);
    const { channel, escrowAuthority, escrowAta } = await openChannel(
      payee.publicKey,
      DEPOSIT,
      expiry
    );
    const payeeAta = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, payee.publicKey)
    ).address;

    const cumulative = new BN(250_000);
    const nonce = new BN(1);
    const msg = checkMessage(channel, cumulative, nonce, expiry);

    // Valid Ed25519 signature, but by an attacker key rather than the payer.
    const attacker = Keypair.generate();
    const badSig = nacl.sign.detached(msg, attacker.secretKey);

    let code = "";
    try {
      await program.methods
        .closeChannel(cumulative, nonce, Array.from(badSig))
        .accountsStrict({
          facilitator: facilitator.publicKey,
          channel,
          payer: payer.publicKey,
          payee: payee.publicKey,
          mint,
          escrowAuthority,
          escrowAta,
          payeeAta,
          payerAta,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix(attacker.publicKey, msg, badSig)])
        .signers([facilitator])
        .rpc();
    } catch (e: any) {
      code = e?.error?.errorCode?.code ?? `${e}`;
    }
    assert.equal(code, "InvalidSignature", "expected the non-payer signature to be rejected");
    // Escrow untouched; channel still open.
    assert.equal((await tokenBalance(escrowAta)).toString(), DEPOSIT.toString());
    assert.deepEqual((await program.account.channel.fetch(channel)).status, { open: {} });
  });

  // -- 4. dispute_channel ---------------------------------------------------

  it("dispute_channel records a newer check and rejects a stale nonce", async () => {
    const payee = Keypair.generate();
    const expiry = new BN((await chainNow()) + 3600);
    const { channel } = await openChannel(payee.publicKey, DEPOSIT, expiry);

    // First dispute: nonce 2, cumulative 300_000 (Open -> CloseInitiated).
    const cumulative = new BN(300_000);
    const nonce = new BN(2);
    const msg = checkMessage(channel, cumulative, nonce, expiry);
    const sig = nacl.sign.detached(msg, payer.secretKey);

    const disputeIx = await program.methods
      .disputeChannel(cumulative, nonce, Array.from(sig))
      .accountsStrict({
        submitter: provider.wallet.publicKey,
        channel,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();
    await provider.sendAndConfirm(
      new Transaction().add(ed25519Ix(payer.publicKey, msg, sig)).add(disputeIx)
    );

    const acc = await program.account.channel.fetch(channel);
    assert.deepEqual(acc.status, { closeInitiated: {} });
    assert.equal(acc.cumulativePaid.toString(), cumulative.toString());
    assert.equal(acc.nonce.toString(), "2");

    // Second dispute with a lower nonce must fail (NonceNotIncreasing).
    const staleCumulative = new BN(100_000);
    const staleNonce = new BN(1);
    const staleMsg = checkMessage(channel, staleCumulative, staleNonce, expiry);
    const staleSig = nacl.sign.detached(staleMsg, payer.secretKey);
    const staleIx = await program.methods
      .disputeChannel(staleCumulative, staleNonce, Array.from(staleSig))
      .accountsStrict({
        submitter: provider.wallet.publicKey,
        channel,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    let threw = false;
    try {
      await provider.sendAndConfirm(
        new Transaction().add(ed25519Ix(payer.publicKey, staleMsg, staleSig)).add(staleIx)
      );
    } catch (_e) {
      threw = true;
    }
    assert.isTrue(threw, "expected a stale nonce to be rejected");
    assert.equal((await program.account.channel.fetch(channel)).nonce.toString(), "2");
  });

  // -- 5. commit_receipt ----------------------------------------------------

  it("commit_receipt writes a receipt PDA", async () => {
    const payee = Keypair.generate().publicKey;
    const resourceHash = Buffer.alloc(32, 9);
    const receiptNonce = new BN(1);
    const amount = new BN(12_345);

    const receipt = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        payer.publicKey.toBuffer(),
        resourceHash,
        receiptNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    await program.methods
      .commitReceipt(amount, Array.from(resourceHash), receiptNonce, 0)
      .accountsStrict({
        facilitator: facilitator.publicKey,
        payer: payer.publicKey,
        payee,
        mint,
        receipt,
        systemProgram: SystemProgram.programId,
      })
      .signers([facilitator])
      .rpc();

    const acc = await program.account.receipt.fetch(receipt);
    assert.equal(acc.amount.toString(), amount.toString());
    assert.equal(acc.payer.toBase58(), payer.publicKey.toBase58());
    assert.equal(acc.scheme, 0);
    assert.deepEqual(Array.from(acc.resourceHash), Array.from(resourceHash));
  });

  // -- 6. open_facilitator_bond ---------------------------------------------

  const bondPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("facilitator_bond"), operator.publicKey.toBuffer()],
      program.programId
    )[0];

  it("open_facilitator_bond escrows the operator bond", async () => {
    const bond = bondPda();
    const bondVault = getAssociatedTokenAddressSync(mint, bond, true, TOKEN_PROGRAM_ID);
    const amount = new BN(500_000);

    await program.methods
      .openFacilitatorBond(amount)
      .accountsStrict({
        operator: operator.publicKey,
        bondMint: mint,
        bond,
        bondVault,
        operatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([operator])
      .rpc();

    const acc = await program.account.facilitatorBond.fetch(bond);
    assert.equal(acc.bondAmount.toString(), amount.toString());
    assert.isTrue(acc.active);
    assert.equal((await tokenBalance(bondVault)).toString(), amount.toString());
  });

  // -- 7. timeout_reclaim ---------------------------------------------------

  it("timeout_reclaim returns the escrow to the payer after expiry", async () => {
    const payee = Keypair.generate();
    const expiry = new BN((await chainNow()) + 2);
    const { channel, escrowAuthority, escrowAta } = await openChannel(
      payee.publicKey,
      DEPOSIT,
      expiry
    );

    await waitForChainTime(expiry.toNumber() + 1);

    const before = await tokenBalance(payerAta);
    await program.methods
      .timeoutReclaim()
      .accountsStrict({
        payer: payer.publicKey,
        channel,
        payee: payee.publicKey,
        mint,
        escrowAuthority,
        escrowAta,
        payerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    assert.equal(
      (await tokenBalance(payerAta)).toString(),
      (before + BigInt(DEPOSIT.toString())).toString()
    );
    assert.isNull(await program.account.channel.fetchNullable(channel));
  });

  // -- 8. slash_facilitator (governance-signed) -----------------------------

  it("slash_facilitator slashes the bond and rejects a non-governance signer", async () => {
    const governance = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(GOVERNANCE_KEYPAIR_PATH, "utf-8")))
    );
    await airdrop(governance.publicKey, 5);

    const bond = bondPda();
    const bondVault = getAssociatedTokenAddressSync(mint, bond, true, TOKEN_PROGRAM_ID);
    const slashDestination = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, governance.publicKey)
    ).address;

    const amount = new BN(200_000);
    const reasonHash = Buffer.alloc(32, 4);

    // Wrong signer is rejected.
    const impostor = Keypair.generate();
    await airdrop(impostor.publicKey, 2);
    let rejected = false;
    try {
      await program.methods
        .slashFacilitator(amount, Array.from(reasonHash))
        .accountsStrict({
          governance: impostor.publicKey,
          operator: operator.publicKey,
          bond,
          bondMint: mint,
          bondVault,
          slashDestination,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([impostor])
        .rpc();
    } catch (_e) {
      rejected = true;
    }
    assert.isTrue(rejected, "expected a non-governance signer to be rejected");

    // Governance slash succeeds.
    await program.methods
      .slashFacilitator(amount, Array.from(reasonHash))
      .accountsStrict({
        governance: governance.publicKey,
        operator: operator.publicKey,
        bond,
        bondMint: mint,
        bondVault,
        slashDestination,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([governance])
      .rpc();

    const acc = await program.account.facilitatorBond.fetch(bond);
    assert.equal(acc.slashed.toString(), amount.toString());
    assert.equal((await tokenBalance(slashDestination)).toString(), amount.toString());
  });
});
