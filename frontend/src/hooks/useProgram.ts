"use client";

import { useMemo } from "react";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

// Replace with Helya's deployed Devnet Program ID in .env.local (NEXT_PUBLIC_PROGRAM_ID)
const FALLBACK_PROGRAM_ID = "11111111111111111111111111111111";

export const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || FALLBACK_PROGRAM_ID
);

/**
 * Derives the deterministic Job escrow PDA: seeds = ["job", clientPubkey, jobId (u64 LE)]
 */
export function deriveJobPda(
  client: PublicKey,
  jobId: number | bigint | BN,
  programId: PublicKey = ESCROW_PROGRAM_ID
): [PublicKey, number] {
  const idBn = BN.isBN(jobId) ? jobId : new BN(jobId.toString());
  const jobIdBuffer = idBn.toArrayLike(Buffer, "le", 8);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), client.toBuffer(), jobIdBuffer],
    programId
  );
}

/**
 * Derives the Escrow Vault PDA holding locked SOL: seeds = ["vault", jobPda]
 */
export function deriveVaultPda(
  jobPda: PublicKey,
  programId: PublicKey = ESCROW_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), jobPda.toBuffer()],
    programId
  );
}

export function useProgram(idl: Idl | null = null) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider || !idl) return null;
    // Anchor v0.30+ reads the address directly from idl.address
    const idlWithAddress = {
      ...idl,
      address: idl.address || ESCROW_PROGRAM_ID.toBase58(),
    } as Idl;

    return new Program(idlWithAddress, provider);
  }, [provider, idl]);

  return {
    program,
    provider,
    programId: ESCROW_PROGRAM_ID,
    isReady: Boolean(program && wallet),
    deriveJobPda,
    deriveVaultPda,
  };
}