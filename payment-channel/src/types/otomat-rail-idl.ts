import { PublicKey } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';

/**
 * Temporary interface for the otomat_rail Anchor program.
 *
 * The on-chain program is authored in a separate phase; when its build emits a
 * generated IDL this file is replaced by that artifact. The instruction
 * discriminators, argument order, and account order defined here are the fixed
 * client-side contract the generated program is expected to match.
 */
export const OTOMAT_RAIL_IDL: Idl = {
  address: 'FwFC1nDo5r224uXDeTMc2X8FhXuiz9CqBF7tg3trEVhN',
  metadata: {
    name: 'otomat_rail',
    version: '0.1.0',
    spec: '0.1.0',
    description: 'Otomat payment channel rail (open, close, dispute, timeout reclaim).',
  },
  instructions: [
    {
      name: 'open_channel',
      discriminator: [91, 45, 253, 71, 140, 166, 107, 109],
      accounts: [
        { name: 'channel', writable: true },
        { name: 'payer', writable: true, signer: true },
        { name: 'payer_token_account', writable: true },
        { name: 'escrow_token_account', writable: true },
        { name: 'mint' },
        { name: 'payee' },
        { name: 'facilitator' },
        { name: 'token_program' },
        { name: 'associated_token_program' },
        { name: 'system_program' },
      ],
      args: [
        { name: 'deposit', type: 'u64' },
        { name: 'expiry', type: 'i64' },
      ],
    },
    {
      name: 'close_channel',
      discriminator: [0, 104, 36, 1, 66, 0, 103, 157],
      accounts: [
        { name: 'channel', writable: true },
        { name: 'payer', writable: true, signer: true },
        { name: 'payee' },
        { name: 'payee_token_account', writable: true },
        { name: 'payer_token_account', writable: true },
        { name: 'escrow_token_account', writable: true },
        { name: 'mint' },
        { name: 'facilitator' },
        { name: 'token_program' },
        { name: 'instructions_sysvar' },
      ],
      args: [
        { name: 'cumulative_amount', type: 'u64' },
        { name: 'nonce', type: 'u64' },
        { name: 'signature', type: { array: ['u8', 64] } },
      ],
    },
    {
      name: 'dispute_channel',
      discriminator: [62, 30, 173, 35, 100, 219, 251, 118],
      accounts: [
        { name: 'channel', writable: true },
        { name: 'payer', writable: true, signer: true },
        { name: 'instructions_sysvar' },
      ],
      args: [
        { name: 'cumulative_amount', type: 'u64' },
        { name: 'nonce', type: 'u64' },
        { name: 'signature', type: { array: ['u8', 64] } },
      ],
    },
    {
      name: 'timeout_reclaim',
      discriminator: [57, 19, 28, 96, 44, 229, 135, 216],
      accounts: [
        { name: 'channel', writable: true },
        { name: 'payer', writable: true, signer: true },
        { name: 'payer_token_account', writable: true },
        { name: 'escrow_token_account', writable: true },
        { name: 'mint' },
        { name: 'token_program' },
      ],
      args: [],
    },
  ],
  accounts: [{ name: 'Channel', discriminator: [49, 159, 99, 106, 220, 87, 219, 88] }],
  types: [
    {
      name: 'Channel',
      type: {
        kind: 'struct',
        fields: [
          { name: 'payer', type: 'pubkey' },
          { name: 'payee', type: 'pubkey' },
          { name: 'mint', type: 'pubkey' },
          { name: 'facilitator', type: 'pubkey' },
          { name: 'deposit', type: 'u64' },
          { name: 'cumulative_amount', type: 'u64' },
          { name: 'nonce', type: 'u64' },
          { name: 'expiry', type: 'i64' },
          { name: 'status', type: 'u8' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
};

export type OtomatRail = typeof OTOMAT_RAIL_IDL;

/** Program id declared by the otomat_rail Anchor program. */
export const OTOMAT_RAIL_PROGRAM_ID = new PublicKey(OTOMAT_RAIL_IDL.address);
