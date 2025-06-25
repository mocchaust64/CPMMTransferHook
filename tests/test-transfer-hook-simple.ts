import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
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
  getAccount,
  createTransferCheckedWithTransferHookInstruction,
  TOKEN_PROGRAM_ID
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

// Hàm tạo token account và mint tokens
async function createTokenAccountAndMintTokens(mintKeypair: Keypair): Promise<PublicKey> {
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
async function initializeExtraAccountMetaList(mintKeypair: Keypair): Promise<string> {
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
      { skipPreflight: true }
    );
    console.log('Account đã được thêm vào whitelist thành công');
    console.log('Transaction signature:', txSig);
    return txSig;
  } catch (error) {
    console.error('Lỗi khi thêm account vào whitelist:', error);
    throw error;
  }
}

// Hàm tạo một token account mới để test transfer
async function createDestinationTokenAccount(mintKeypair: Keypair): Promise<PublicKey> {
  console.log('\n=== Tạo destination token account ===');
  
  // Tạo keypair cho destination
  const destinationKeypair = Keypair.generate();
  console.log('Destination wallet:', destinationKeypair.publicKey.toString());
  
  // Chuyển SOL cho destination để cover rent
  const transferSolTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: destinationKeypair.publicKey,
      lamports: 10000000 // 0.01 SOL
    })
  );
  
  await sendAndConfirmTransaction(
    connection,
    transferSolTx,
    [payer],
    { skipPreflight: true }
  );
  
  // Tạo token account cho destination
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    destinationKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  console.log('Destination token account:', destinationTokenAccount.toString());
  
  // Tạo và gửi transaction để tạo token account
  const createAccountTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      destinationTokenAccount,
      destinationKeypair.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  
  const createAccountTxSig = await sendAndConfirmTransaction(
    connection,
    createAccountTx,
    [payer],
    { skipPreflight: true }
  );
  console.log('Create destination token account transaction signature:', createAccountTxSig);
  console.log('Destination token account đã được tạo thành công');
  
  return destinationTokenAccount;
}

// Hàm chuyển token từ source đến destination (đã được whitelist)
async function transferTokens(
  mintKeypair: Keypair,
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  amount: number
): Promise<string> {
  console.log('\n=== Chuyển token từ source đến destination ===');
  console.log('Source token account:', sourceTokenAccount.toString());
  console.log('Destination token account:', destinationTokenAccount.toString());
  console.log('Số lượng token cần chuyển:', amount);
  
  // Lấy số decimals của token
  const decimals = 9;
  const transferAmount = BigInt(amount * 10 ** decimals);
  
  try {
    // Tạo transfer instruction với transfer hook
    const transferInstruction = await createTransferCheckedWithTransferHookInstruction(
      connection,
      sourceTokenAccount,
      mintKeypair.publicKey,
      destinationTokenAccount,
      payer.publicKey,
      transferAmount,
      decimals,
      [],
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    // Tạo transaction
    const transferTx = new Transaction().add(transferInstruction);
    
    // Gửi và xác nhận transaction
    const txSig = await sendAndConfirmTransaction(
      connection,
      transferTx,
      [payer],
      { skipPreflight: true }
    );
    
    console.log('Transfer thành công!');
    console.log('Transaction signature:', txSig);
    
    // Kiểm tra số dư sau khi chuyển
    const sourceAccountInfo = await getAccount(
      connection,
      sourceTokenAccount,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Số dư source token account sau khi chuyển: ${sourceAccountInfo.amount}`);
    
    const destinationAccountInfo = await getAccount(
      connection,
      destinationTokenAccount,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Số dư destination token account sau khi chuyển: ${destinationAccountInfo.amount}`);
    
    return txSig;
  } catch (error) {
    console.error('Lỗi khi chuyển token:', error);
    throw error;
  }
}

// Hàm test chuyển token đến địa chỉ không có trong whitelist (nên thất bại)
async function testTransferToNonWhitelisted(
  mintKeypair: Keypair,
  sourceTokenAccount: PublicKey
): Promise<void> {
  console.log('\n=== Test chuyển token đến địa chỉ không có trong whitelist ===');
  
  // Tạo một destination mới không nằm trong whitelist
  const nonWhitelistedKeypair = Keypair.generate();
  console.log('Non-whitelisted wallet:', nonWhitelistedKeypair.publicKey.toString());
  
  // Chuyển SOL cho destination để cover rent
  const transferSolTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: nonWhitelistedKeypair.publicKey,
      lamports: 10000000 // 0.01 SOL
    })
  );
  
  await sendAndConfirmTransaction(
    connection,
    transferSolTx,
    [payer],
    { skipPreflight: true }
  );
  
  // Tạo token account cho non-whitelisted destination
  const nonWhitelistedTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    nonWhitelistedKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  console.log('Non-whitelisted token account:', nonWhitelistedTokenAccount.toString());
  
  // Tạo và gửi transaction để tạo token account
  const createAccountTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      nonWhitelistedTokenAccount,
      nonWhitelistedKeypair.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  
  await sendAndConfirmTransaction(
    connection,
    createAccountTx,
    [payer],
    { skipPreflight: true }
  );
  
  // Thử chuyển token đến non-whitelisted account (nên thất bại)
  const decimals = 9;
  const transferAmount = BigInt(10 * 10 ** decimals); // 10 tokens
  
  try {
    // Tạo transfer instruction với transfer hook
    const transferInstruction = await createTransferCheckedWithTransferHookInstruction(
      connection,
      sourceTokenAccount,
      mintKeypair.publicKey,
      nonWhitelistedTokenAccount,
      payer.publicKey,
      transferAmount,
      decimals,
      [],
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    // Tạo transaction
    const transferTx = new Transaction().add(transferInstruction);
    
    // Gửi và xác nhận transaction
    console.log('Đang thử chuyển token đến non-whitelisted account...');
    const txSig = await sendAndConfirmTransaction(
      connection,
      transferTx,
      [payer],
      { skipPreflight: true }
    );
    
    console.log('Transfer đã thành công (không mong đợi điều này)!');
    console.log('Transaction signature:', txSig);
  } catch (error) {
    console.log('Transfer đến non-whitelisted account đã thất bại như mong đợi!');
    console.log('Lỗi:', error.message);
  }
}

// Hàm test chính
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST TRANSFER HOOK PROGRAM ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Tạo token mint với Transfer Hook extension
    const mintKeypair = await createTokenWithTransferHook();
    
    // Tạo token account và mint tokens
    const ownerTokenAccount = await createTokenAccountAndMintTokens(mintKeypair);
    
    // Khởi tạo ExtraAccountMetaList
    await initializeExtraAccountMetaList(mintKeypair);
    
    // Tạo destination token account
    const destinationTokenAccount = await createDestinationTokenAccount(mintKeypair);
    
    // Thêm destination token account vào whitelist
    await addAccountToWhitelist(destinationTokenAccount);
    
    // Chuyển token từ source đến destination (đã được whitelist)
    await transferTokens(mintKeypair, ownerTokenAccount, destinationTokenAccount, 100);
    
    // Test chuyển token đến địa chỉ không có trong whitelist (nên thất bại)
    await testTransferToNonWhitelisted(mintKeypair, ownerTokenAccount);
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    console.log('Mint address:', mintKeypair.publicKey.toString());
    console.log('Owner token account:', ownerTokenAccount.toString());
    console.log('Destination token account (đã được thêm vào whitelist):', destinationTokenAccount.toString());
    
    console.log('\nBạn có thể xem thông tin trên Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${mintKeypair.publicKey.toString()}?cluster=devnet`);
    console.log(`https://explorer.solana.com/address/${ownerTokenAccount.toString()}?cluster=devnet`);
    console.log(`https://explorer.solana.com/address/${destinationTokenAccount.toString()}?cluster=devnet`);
    
  } catch (error) {
    console.error('Lỗi khi test Transfer Hook program:', error);
  }
}

// Chạy test
runTest(); 