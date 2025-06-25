import * as anchor from '@coral-xyz/anchor';
import { Program, BN, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Định nghĩa interface cho RaydiumCpSwap
interface RaydiumCpSwap extends Idl {
  // Định nghĩa các phương thức và tài khoản của chương trình
}

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

// Transfer Hook program ID
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('BmcmrHRjV2feBspwFsmWWwzNThT5o6sKM1zwoQcjKoG');

// Hàm để lấy PDA cho whiteList
async function getWhiteListPDA(programId: PublicKey): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("white_list")],
    programId
  );
  return pda;
}

// Hàm để lấy PDA cho ExtraAccountMetaList
async function getExtraAccountMetaListPDA(mint: PublicKey, programId: PublicKey): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    programId
  );
  return pda;
}

// Hàm tạo token mint với Transfer Hook extension
async function createTokenWithTransferHook(connection: Connection, payer: Keypair): Promise<Keypair> {
  console.log('\n=== Tạo token mint với Transfer Hook extension ===');
  
  // Tạo keypair cho mint token
  const mintKeypair = Keypair.generate();
  const decimals = 9;
  
  console.log('Mint address:', mintKeypair.publicKey.toString());
  
  // Tính kích thước cần thiết cho account mint với extension TransferHook
  const extensions = [ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  // Tạo transaction khởi tạo mint với Transfer Hook
  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: lamports,
      programId: TOKEN_2022_PROGRAM_ID
    }),
    createInitializeTransferHookInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      TRANSFER_HOOK_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  // Gửi và xác nhận transaction tạo mint
  const mintTxSig = await sendAndConfirmTransaction(
    connection,
    createMintTx,
    [payer, mintKeypair],
    { skipPreflight: true }
  );
  console.log('Mint transaction signature:', mintTxSig);
  console.log('Mint với Transfer Hook đã được tạo thành công');
  
  return mintKeypair;
}

// Hàm tạo token account và mint tokens
async function createTokenAccountAndMintTokens(
  connection: Connection,
  payer: Keypair,
  mintKeypair: Keypair
): Promise<PublicKey> {
  console.log('\n=== Tạo token account và mint tokens ===');
  
  // Tạo token account cho owner
  const ownerTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  console.log('Owner token account:', ownerTokenAccount.toString());
  
  // Tạo và gửi transaction để tạo token account và mint tokens
  const amount = 1000_000_000_000; // 1000 tokens với 9 decimals
  const createAccountAndMintTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ownerTokenAccount,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      ownerTokenAccount,
      payer.publicKey,
      amount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  const mintToTxSig = await sendAndConfirmTransaction(
    connection,
    createAccountAndMintTx,
    [payer],
    { skipPreflight: true }
  );
  console.log('Mint tokens transaction signature:', mintToTxSig);
  console.log('Token account đã được tạo và tokens đã được mint thành công');
  
  // Kiểm tra số dư
  const tokenAccountInfo = await getAccount(
    connection,
    ownerTokenAccount,
    'confirmed',
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Số dư token account: ${tokenAccountInfo.amount}`);
  
  return ownerTokenAccount;
}

// Hàm khởi tạo ExtraAccountMetaList
async function initializeExtraAccountMetaList(
  connection: Connection,
  payer: Keypair,
  mintKeypair: Keypair
): Promise<string> {
  console.log('\n=== Khởi tạo ExtraAccountMetaList ===');
  
  // Lấy PDA cho whiteList và extraAccountMetaList
  const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
  const extraAccountMetaListPDA = await getExtraAccountMetaListPDA(mintKeypair.publicKey, TRANSFER_HOOK_PROGRAM_ID);
  
  console.log('White List PDA:', whiteListPDA.toString());
  console.log('ExtraAccountMetaList PDA:', extraAccountMetaListPDA.toString());
  
  // Tạo transaction để khởi tạo ExtraAccountMetaList
  const initializeExtraAccountMetaListTx = new Transaction();
  
  // Tạo instruction data
  const instructionData = Buffer.from([43, 34, 13, 49, 167, 88, 235, 235]); // Discriminator cho initializeExtraAccountMetaList
  
  // Tạo instruction để khởi tạo ExtraAccountMetaList
  const initializeExtraAccountMetaListIx = {
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true }, // extraAccountMetaList
      { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: false }, // mint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
      { pubkey: whiteListPDA, isSigner: false, isWritable: true } // whiteList
    ],
    data: instructionData
  };
  
  initializeExtraAccountMetaListTx.add(initializeExtraAccountMetaListIx);
  
  try {
    const txSig = await sendAndConfirmTransaction(
      connection,
      initializeExtraAccountMetaListTx,
      [payer],
      { skipPreflight: true }
    );
    console.log('ExtraAccountMetaList đã được khởi tạo thành công');
    console.log('Transaction signature:', txSig);
    return txSig;
  } catch (error) {
    console.error('Lỗi khi khởi tạo ExtraAccountMetaList:', error);
    throw error;
  }
}

// Hàm tạo AMM Config
async function createAmmConfig(
  connection: Connection,
  payer: Keypair,
  programId: PublicKey
): Promise<PublicKey> {
  console.log('\n=== Tạo AMM Config ===');
  
  try {
    // Import IDL từ file JSON
    const idlPath = path.join(__dirname, '../target/idl/raydium_cp_swap.json');
    const idlFile = fs.readFileSync(idlPath, 'utf8');
    const IDL = JSON.parse(idlFile);
    
    console.log('Đã đọc IDL từ file');
    
    // Tạo provider từ connection và payer
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program với IDL và program ID theo Anchor 0.31.0
    const program = new anchor.Program(IDL, provider);
    
    // Lấy PDA cho AMM Config
    const configIndex = 0;
    const [ammConfigAddress, _] = await getAmmConfigAddress(configIndex, programId);
    console.log('AMM Config address:', ammConfigAddress.toString());
    
    // Tạo transaction để khởi tạo AMM config
    const tx = await program.methods
      .createAmmConfig(
        configIndex, // config_index
        new BN(25), // tradeFeeRate
        new BN(10000), // protocolFeeRate
        new BN(5), // fundFeeRate
        new BN(0) // createPoolFee
      )
      .accounts({
        owner: payer.publicKey,
        ammConfig: ammConfigAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });
    
    console.log('AMM Config đã được tạo thành công');
    console.log('Transaction signature:', tx);
    
    return ammConfigAddress;
  } catch (error) {
    console.error('Lỗi khi tạo AMM Config:', error);
    throw error;
  }
}

// Hàm test chính
async function main() {
  console.log('=== BẮT ĐẦU TEST TẠO TOKEN VÀ AMM CONFIG ===');
  
  // Đọc keypair từ file ~/.config/solana/id.json
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);
  
  console.log('Payer address:', payer.publicKey.toString());
  
  // Kết nối đến devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    // Tạo token mint với Transfer Hook extension
    const tokenWithHookKeypair = await createTokenWithTransferHook(connection, payer);
    
    // Tạo token account và mint tokens
    await createTokenAccountAndMintTokens(connection, payer, tokenWithHookKeypair);
    
    // Khởi tạo ExtraAccountMetaList
    await initializeExtraAccountMetaList(connection, payer, tokenWithHookKeypair);
    
    // Raydium CP Swap program ID
    const CP_SWAP_PROGRAM_ID = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
    
    // Tạo AMM Config
    await createAmmConfig(connection, payer, CP_SWAP_PROGRAM_ID);
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    console.log('Token with Hook Mint:', tokenWithHookKeypair.publicKey.toString());
    
  } catch (error) {
    console.error('Lỗi khi test tạo token và AMM Config:', error);
  }
}

// Chạy test
main(); 