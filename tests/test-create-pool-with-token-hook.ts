import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  createAssociatedTokenAccountInstruction,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";
import {
  accountExist,
  createAmmConfig,
  initialize
} from "./utils";

// Hàm để chuyển số u16 thành bytes
function u16ToBytes(num: number) {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

// Hàm để lấy PDA cho AMM Config
async function getAmmConfigAddress(
  index: number,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("amm_config"), u16ToBytes(index)],
    programId
  );
  return [address, bump];
}

// Hàm để lấy PDA cho Pool
async function getPoolAddress(
  ammConfigAddress: PublicKey,
  token0: PublicKey,
  token1: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("pool_state_seed"),
      ammConfigAddress.toBuffer(),
      token0.toBuffer(),
      token1.toBuffer(),
    ],
    programId
  );
  return [address, bump];
}

// Hàm để lấy PDA cho Authority
async function getAuthAddress(programId: PublicKey): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("vault_and_lp_mint_auth_seed")],
    programId
  );
  return [address, bump];
}

// Hàm để lấy PDA cho LP Mint
async function getPoolLpMintAddress(
  poolAddress: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("lp_mint"), poolAddress.toBuffer()],
    programId
  );
  return [address, bump];
}

// Hàm để lấy PDA cho Pool Vault
async function getPoolVaultAddress(
  poolAddress: PublicKey,
  mintAddress: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("pool_vault_seed"), poolAddress.toBuffer(), mintAddress.toBuffer()],
    programId
  );
  return [address, bump];
}

// Hàm để lấy PDA cho Oracle
async function getOrcleAccountAddress(
  poolAddress: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("oracle"), poolAddress.toBuffer()],
    programId
  );
  return [address, bump];
}

// Hàm tạo token mới
async function createNewToken(
  connection: Connection,
  payer: Keypair,
  decimals: number = 9
): Promise<{ mint: PublicKey, tokenProgram: PublicKey }> {
  // Tạo token mới
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    decimals,
    undefined,
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  
  console.log(`Đã tạo token mới: ${mint.toString()}`);
  
  // Tạo account cho token và mint một số token
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    'confirmed',
    { skipPreflight: true },
    TOKEN_PROGRAM_ID
  );
  
  console.log(`Đã tạo token account: ${tokenAccount.address.toString()}`);
  
  // Mint 1,000,000 token với 9 số thập phân
  await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer.publicKey,
    1_000_000_000_000_000,
    [],
    { skipPreflight: true },
    TOKEN_PROGRAM_ID
  );
  
  console.log(`Đã mint token vào account`);
  
  return { mint, tokenProgram: TOKEN_PROGRAM_ID };
}

// Hàm test chính
async function main() {
  console.log('=== TẠO POOL VỚI HAI TOKEN MỚI ===');
  
  // Đọc keypair từ file ~/.config/solana/id.json
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);
  
  console.log('Payer address:', payer.publicKey.toString());
  
  // Kết nối đến devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    // Tạo hai token mới
    console.log('\n=== Tạo Token A ===');
    const { mint: mintA, tokenProgram: tokenProgramA } = await createNewToken(connection, payer);
    
    console.log('\n=== Tạo Token B ===');
    const { mint: mintB, tokenProgram: tokenProgramB } = await createNewToken(connection, payer);
    
    // Kiểm tra và sắp xếp token để đảm bảo token0 < token1
    let token0, token0Program, token1, token1Program;
    
    // So sánh địa chỉ để đảm bảo token0 < token1
    if (mintA.toBuffer().compare(mintB.toBuffer()) < 0) {
      token0 = mintA;
      token0Program = tokenProgramA;
      token1 = mintB;
      token1Program = tokenProgramB;
      console.log('Token0 là Token A, Token1 là Token B');
    } else {
      token0 = mintB;
      token0Program = tokenProgramB;
      token1 = mintA;
      token1Program = tokenProgramA;
      console.log('Token0 là Token B, Token1 là Token A');
    }
    
    // Khởi tạo provider từ connection và wallet
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Raydium CP Swap program ID
    const CP_SWAP_PROGRAM_ID = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
    
    // Khởi tạo program
    const idl = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../target/idl/raydium_cp_swap.json'),
        'utf8'
      )
    );
    
    const program = new anchor.Program(idl, provider);
    
    // Tạo AMM Config
    console.log('\n=== Tạo AMM Config ===');
    try {
      const configIndex = 0;
      const ammConfigAddress = await createAmmConfig(
        program as any,
        connection,
        payer,
        configIndex,
        new BN(25), // tradeFeeRate
        new BN(10000), // protocolFeeRate 
        new BN(5), // fundFeeRate
        new BN(0), // createPoolFee
        { skipPreflight: true }
      );
      console.log('AMM Config address:', ammConfigAddress.toString());
      
      // Tạo pool
      console.log('\n=== Khởi tạo pool ===');
      const { poolAddress, poolState } = await initialize(
        program as any,
        payer,
        ammConfigAddress,
        token0,
        token0Program,
        token1,
        token1Program,
        { skipPreflight: true },
        {
          initAmount0: new BN(1_000_000_000), // 1000 token với 9 số thập phân
          initAmount1: new BN(1_000_000_000), // 1000 token với 9 số thập phân
        }
      );
      console.log('Pool đã được tạo thành công!');
      console.log('Pool address:', poolAddress.toString());
    } catch (error) {
      console.error('Lỗi khi tạo pool:', error);
    }
    
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

// Chạy test khi chạy file này trực tiếp
if (require.main === module) {
  main();
} 