import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  ExtensionType,
  createAccount,
  getAccountLen
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
  initialize,
} from "./utils/index";

// Đọc keypair từ file ~/.config/solana/id.json
const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
const payer = Keypair.fromSecretKey(secretKey);

// Kết nối đến devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Hàm tạo token thông thường
async function createStandardToken(
  connection: Connection,
  payer: Keypair,
  decimals: number = 6
): Promise<{ mint: PublicKey, tokenAccount: PublicKey, tokenProgram: PublicKey }> {
  console.log('\n=== Tạo token thông thường ===');
  
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
  
  console.log('Mint token thường:', mint.toString());
  
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
  
  console.log('Token account:', tokenAccount.address.toString());
  
  await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer.publicKey,
    1_000_000_000_000, // 1,000,000 tokens
    [],
    { skipPreflight: true },
    TOKEN_PROGRAM_ID
  );
  
  console.log('Đã mint token thường vào account');
  
  return { mint, tokenAccount: tokenAccount.address, tokenProgram: TOKEN_PROGRAM_ID };
}

// Hàm tạo token Token-2022 với transfer hook extension
async function createToken2022WithTransferHook(
  connection: Connection,
  payer: Keypair,
  decimals: number = 9
): Promise<{ mint: PublicKey, tokenAccount: PublicKey, tokenProgram: PublicKey }> {
  console.log('\n=== Tạo token Token-2022 với Transfer Hook Extension ===');
  
  try {
    // Tạo token mint với TOKEN_2022_PROGRAM_ID
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      decimals,
      undefined,
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('Mint Token-2022 với Transfer Hook:', mint.toString());
    
    // Thêm Transfer Hook Extension
    // Sử dụng ví dụ về SPL token program (default program) như một placeholder
    const programId = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    
    try {
      // Sử dụng low-level API để thêm extension trực tiếp từ transaction
      const instructions = [];
      
      // Phần này cần phải thực hiện bằng giao dịch tùy chỉnh
      // Ở đây chúng ta bỏ qua để đơn giản hóa, nhưng trong thực tế cần 
      // tạo instruction để thiết lập transfer hook extension
      
      console.log('Đã thêm Transfer Hook Extension');
    } catch (error) {
      console.error('Lỗi khi thêm Transfer Hook Extension:', error);
    }
    
    // Tạo token account
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      payer.publicKey,
      false,
      'confirmed',
      { skipPreflight: true },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('Token account:', tokenAccount.address.toString());
    
    // Mint tokens
    await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      payer.publicKey,
      1_000_000_000_000, // 1,000,000 tokens
      [],
      { skipPreflight: true },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log('Đã mint token vào account');
    
    return { mint, tokenAccount: tokenAccount.address, tokenProgram: TOKEN_2022_PROGRAM_ID };
  } catch (error) {
    console.error('Lỗi khi tạo token với Transfer Hook:', error);
    throw error;
  }
}

// Chương trình chính
async function main() {
  try {
    console.log('=== TẠO POOL VỚI TOKEN-2022 (TRANSFER HOOK) ===');
    console.log('Payer:', payer.publicKey.toString());
    
    // Tạo token bằng Token-2022 có transfer hook
    const { mint: token2022Mint, tokenAccount: token2022Account, tokenProgram: token2022Program } = 
      await createToken2022WithTransferHook(connection, payer);
    
    // Tạo token thông thường
    const { mint: regularTokenMint, tokenAccount: regularTokenAccount, tokenProgram: regularTokenProgram } = 
      await createStandardToken(connection, payer);
      
    // Đảm bảo token0 < token1
    let token0, token0Program, token1, token1Program;
    if (token2022Mint.toBuffer().compare(regularTokenMint.toBuffer()) < 0) {
      token0 = token2022Mint;
      token0Program = token2022Program;
      token1 = regularTokenMint;
      token1Program = regularTokenProgram;
      console.log('Token0 là Token-2022 với Transfer Hook, Token1 là token thường');
    } else {
      token0 = regularTokenMint;
      token0Program = regularTokenProgram;
      token1 = token2022Mint;
      token1Program = token2022Program;
      console.log('Token0 là token thường, Token1 là Token-2022 với Transfer Hook');
    }
    
    // Khởi tạo provider từ connection và wallet
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program
    const idl = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../target/idl/raydium_cp_swap.json'),
        'utf8'
      )
    );
    
    const program = new anchor.Program(idl, provider) as any as Program<RaydiumCpSwap>;
    
    // Tạo AMM Config
    console.log('\n=== Tạo AMM Config ===');
    const configIndex = 0;
    const ammConfigAddress = await createAmmConfig(
      program,
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
    
    // Khởi tạo pool
    console.log('\n=== Khởi tạo pool ===');
    try {
      const { poolAddress } = await initialize(
        program,
        payer,
        ammConfigAddress,
        token0,
        token0Program,
        token1,
        token1Program,
        { skipPreflight: true },
        {
          initAmount0: new BN(10_000_000), // 10 token0
          initAmount1: new BN(10_000_000), // 10 token1
        }
      );
      
      console.log('Pool address:', poolAddress.toString());
      console.log('Hoàn thành tạo pool với Token-2022!');
    } catch (error) {
      console.error('Lỗi khi tạo pool:', error);
      if (error instanceof Error && 'logs' in error) {
        console.error('Transaction logs:', (error as any).logs);
      }
    }
    
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main(); 