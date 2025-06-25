import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Đọc keypair từ file ~/.config/solana/id.json
const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
const payer = Keypair.fromSecretKey(secretKey);

// Kết nối đến devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

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
async function createTokenWithTransferHook(): Promise<Keypair> {
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

// Hàm khởi tạo ExtraAccountMetaList và reset whitelist
async function initializeExtraAccountMetaList(mintKeypair: Keypair): Promise<string> {
  console.log('\n=== Khởi tạo ExtraAccountMetaList và reset whitelist ===');
  
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

// Hàm thêm account vào whitelist
async function addAccountToWhitelist(accountToAdd: PublicKey): Promise<string> {
  console.log('\n=== Thêm account vào whitelist ===');
  console.log('Account cần thêm:', accountToAdd.toString());
  
  // Lấy PDA cho whiteList
  const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
  
  // Tạo transaction để thêm account vào whitelist
  const addToWhitelistTx = new Transaction();
  
  // Tạo instruction data
  const instructionData = Buffer.from([157, 211, 52, 54, 144, 81, 5, 55]); // Discriminator cho addToWhitelist
  
  // Tạo instruction để thêm account vào whitelist
  const addToWhitelistIx = {
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: accountToAdd, isSigner: false, isWritable: false }, // newAccount
      { pubkey: whiteListPDA, isSigner: false, isWritable: true }, // whiteList
      { pubkey: payer.publicKey, isSigner: true, isWritable: true } // signer
    ],
    data: instructionData
  };
  
  addToWhitelistTx.add(addToWhitelistIx);
  
  try {
    const txSig = await sendAndConfirmTransaction(
      connection,
      addToWhitelistTx,
      [payer],
      { skipPreflight: false } // Đặt false để xem logs chi tiết
    );
    console.log('Account đã được thêm vào whitelist thành công');
    console.log('Transaction signature:', txSig);
    return txSig;
  } catch (error: any) {
    console.error('Lỗi khi thêm account vào whitelist:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    throw error;
  }
}

// Hàm test chính
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST RESET WHITELIST ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Tạo token mint với Transfer Hook extension
    const tokenWithHookKeypair = await createTokenWithTransferHook();
    
    // Khởi tạo ExtraAccountMetaList và reset whitelist
    await initializeExtraAccountMetaList(tokenWithHookKeypair);
    
    // Tạo một keypair cho vault
    const vaultKeypair = Keypair.generate();
    console.log('\n=== Tạo vault cho token ===');
    console.log('Vault address:', vaultKeypair.publicKey.toString());
    
    // Thêm vault vào whitelist
    await addAccountToWhitelist(vaultKeypair.publicKey);
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    console.log('Token with Hook Mint:', tokenWithHookKeypair.publicKey.toString());
    console.log('Vault đã được thêm vào whitelist:', vaultKeypair.publicKey.toString());
    
    console.log('\nBạn có thể xem thông tin trên Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${tokenWithHookKeypair.publicKey.toString()}?cluster=devnet`);
    
  } catch (error) {
    console.error('Lỗi khi test reset whitelist:', error);
  }
}

// Chạy test
runTest(); 