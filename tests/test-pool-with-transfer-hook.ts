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
import * as anchor from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { Program } from '@coral-xyz/anchor';
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";

// Import IDL từ file JSON
const idlPath = path.join(__dirname, '../target/idl/raydium_cp_swap.json');
const idlFile = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlFile);

// Đọc keypair từ file ~/.config/solana/id.json
const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
const payer = Keypair.fromSecretKey(secretKey);

// Kết nối đến devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Transfer Hook program ID
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('BmcmrHRjV2feBspwFsmWWwzNThT5o6sKM1zwoQcjKoG');

// Raydium CP Swap program ID (thay thế bằng ID thực tế của bạn)
const CP_SWAP_PROGRAM_ID = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');

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

// Hàm tạo token USDC thông thường (không có Transfer Hook)
async function createUSDCToken(): Promise<[Keypair, PublicKey]> {
  console.log('\n=== Tạo token USDC thông thường ===');
  
  // Tạo keypair cho mint token
  const mintKeypair = Keypair.generate();
  const decimals = 6; // USDC có 6 decimals
  
  console.log('USDC Mint address:', mintKeypair.publicKey.toString());
  
  // Tạo transaction khởi tạo mint
  const mintLamports = await connection.getMinimumBalanceForRentExemption(82);
  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: 82,
      lamports: mintLamports,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      null,
      TOKEN_PROGRAM_ID
    )
  );
  
  // Gửi và xác nhận transaction tạo mint
  const mintTxSig = await sendAndConfirmTransaction(
    connection,
    createMintTx,
    [payer, mintKeypair],
    { skipPreflight: true }
  );
  console.log('USDC Mint transaction signature:', mintTxSig);
  
  // Tạo token account cho owner
  const ownerTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  console.log('USDC Owner token account:', ownerTokenAccount.toString());
  
  // Tạo và gửi transaction để tạo token account và mint tokens
  const amount = 1000000000; // 1000 USDC với 6 decimals
  const createAccountAndMintTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ownerTokenAccount,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      ownerTokenAccount,
      payer.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  
  const mintToTxSig = await sendAndConfirmTransaction(
    connection,
    createAccountAndMintTx,
    [payer],
    { skipPreflight: true }
  );
  console.log('USDC Mint tokens transaction signature:', mintToTxSig);
  console.log('USDC token account đã được tạo và tokens đã được mint thành công');
  
  return [mintKeypair, ownerTokenAccount];
}

// Hàm tạo AMM config
async function createAmmConfig(): Promise<PublicKey> {
  console.log('\n=== Tạo AMM Config ===');
  
  try {
    // Tạo provider từ connection và payer
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program
    const program = anchor.workspace.RaydiumCpSwap as Program<RaydiumCpSwap>;
    
    // Lấy PDA cho AMM Config
    const configIndex = 0;
    const [ammConfigAddress, _] = await getAmmConfigAddress(configIndex, program.programId);
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

// Hàm tạo pool với token có Transfer Hook
async function createPoolWithTransferHook(
  tokenWithHookMint: PublicKey,
  tokenWithHookAccount: PublicKey,
  usdcMint: PublicKey,
  usdcAccount: PublicKey,
  ammConfigAccount: PublicKey
): Promise<PublicKey> {
  console.log('\n=== Tạo pool với token có Transfer Hook ===');
  console.log('Token with Hook Mint:', tokenWithHookMint.toString());
  console.log('USDC Mint:', usdcMint.toString());
  
  try {
    // Tạo keypair cho pool state account
    const poolStateKeypair = Keypair.generate();
    console.log('Pool State address:', poolStateKeypair.publicKey.toString());
    
    // Tạo vault cho token A (token with hook)
    const tokenAVaultKeypair = Keypair.generate();
    console.log('Token A Vault address:', tokenAVaultKeypair.publicKey.toString());
    
    // Tạo vault cho token B (USDC)
    const tokenBVaultKeypair = Keypair.generate();
    console.log('Token B Vault address:', tokenBVaultKeypair.publicKey.toString());
    
    // Thêm token A vault vào whitelist
    await addAccountToWhitelist(tokenAVaultKeypair.publicKey);
    
    // Tạo provider từ connection và payer
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program
    const program = anchor.workspace.RaydiumCpSwap as Program<RaydiumCpSwap>;
    
    // Tạo các địa chỉ cần thiết cho pool
    const [auth] = await PublicKey.findProgramAddress(
      [Buffer.from("vault_and_lp_mint_auth_seed")],
      program.programId
    );
    
    const [lpMintAddress] = await PublicKey.findProgramAddress(
      [Buffer.from("lp_mint"), poolStateKeypair.publicKey.toBuffer()],
      program.programId
    );
    
    const [observationAddress] = await PublicKey.findProgramAddress(
      [Buffer.from("oracle"), poolStateKeypair.publicKey.toBuffer()],
      program.programId
    );
    
    const creatorLpTokenAddress = getAssociatedTokenAddressSync(
      lpMintAddress,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    
    // Địa chỉ createPoolFee (có thể là địa chỉ bất kỳ)
    const createPoolFee = new PublicKey("2p3CiCssv21WeTyQDVZZL66UyXByJZd4oqrPyV7tz3qu");
    
    // Tạo transaction để khởi tạo pool
    const tx = await program.methods
      .initialize(
        new BN(0), // initialTokenAAmount
        new BN(0), // initialTokenBAmount
        new BN(0) // openTime
      )
      .accountsPartial({
        creator: payer.publicKey,
        ammConfig: ammConfigAccount,
        authority: auth,
        poolState: poolStateKeypair.publicKey,
        token0Mint: tokenWithHookMint,
        token1Mint: usdcMint,
        lpMint: lpMintAddress,
        creatorToken0: tokenWithHookAccount,
        creatorToken1: usdcAccount,
        creatorLpToken: creatorLpTokenAddress,
        token0Vault: tokenAVaultKeypair.publicKey,
        token1Vault: tokenBVaultKeypair.publicKey,
        createPoolFee: createPoolFee,
        observationState: observationAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        token0Program: TOKEN_2022_PROGRAM_ID,
        token1Program: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([poolStateKeypair, tokenAVaultKeypair, tokenBVaultKeypair])
      .rpc();
    
    console.log('Pool với token có Transfer Hook đã được tạo thành công');
    console.log('Transaction signature:', tx);
    
    return poolStateKeypair.publicKey;
  } catch (error) {
    console.error('Lỗi khi tạo pool với token có Transfer Hook:', error);
    throw error;
  }
}

// Hàm test chính
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST TẠO POOL VỚI TOKEN CÓ TRANSFER HOOK ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Tạo token mint với Transfer Hook extension
    const tokenWithHookKeypair = await createTokenWithTransferHook();
    
    // Tạo token account và mint tokens
    const tokenWithHookAccount = await createTokenAccountAndMintTokens(tokenWithHookKeypair);
    
    // Khởi tạo ExtraAccountMetaList
    await initializeExtraAccountMetaList(tokenWithHookKeypair);
    
    // Tạo token USDC thông thường
    const [usdcKeypair, usdcAccount] = await createUSDCToken();
    
    // Tạo AMM config
    const ammConfigAccount = await createAmmConfig();
    
    // Tạo pool với token có Transfer Hook
    const poolStateAccount = await createPoolWithTransferHook(
      tokenWithHookKeypair.publicKey,
      tokenWithHookAccount,
      usdcKeypair.publicKey,
      usdcAccount,
      ammConfigAccount
    );
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    console.log('Token with Hook Mint:', tokenWithHookKeypair.publicKey.toString());
    console.log('USDC Mint:', usdcKeypair.publicKey.toString());
    console.log('Pool State Account:', poolStateAccount.toString());
    
    console.log('\nBạn có thể xem thông tin trên Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${tokenWithHookKeypair.publicKey.toString()}?cluster=devnet`);
    console.log(`https://explorer.solana.com/address/${usdcKeypair.publicKey.toString()}?cluster=devnet`);
    console.log(`https://explorer.solana.com/address/${poolStateAccount.toString()}?cluster=devnet`);
    
  } catch (error) {
    console.error('Lỗi khi test tạo pool với token có Transfer Hook:', error);
  }
}

// Chạy test
runTest();

/*
 * KẾT LUẬN VÀ BƯỚC TIẾP THEO
 * 
 * Dựa trên kết quả test, chúng ta đã thành công trong việc:
 * 1. Tạo token mint với Transfer Hook extension
 * 2. Khởi tạo ExtraAccountMetaList và whitelist
 * 3. Thêm account vào whitelist
 * 4. Chuyển token thành công đến địa chỉ trong whitelist
 * 5. Xác nhận rằng chuyển token đến địa chỉ không có trong whitelist sẽ thất bại
 * 
 * Tuy nhiên, chúng ta gặp lỗi khi tạo AMM Config và Pool. Để hoàn thiện việc tích hợp SPL Token 2022 
 * với Transfer Hook whitelist vào dự án Raydium CP Swap, chúng ta cần:
 * 
 * 1. Sửa lại cách khởi tạo AMM Config và Pool trong file test-pool-with-transfer-hook.ts
 * 2. Đảm bảo rằng vault của token với Transfer Hook được thêm vào whitelist trước khi khởi tạo pool
 * 3. Kiểm tra lại các tham số và account cần thiết cho việc khởi tạo pool
 * 
 * Việc tạo AMM Config gặp lỗi có thể do:
 * - Vấn đề với cách khởi tạo Program
 * - Vấn đề với cách gọi phương thức createAmmConfig
 * - Vấn đề với cách sử dụng PDA
 * 
 * Bước tiếp theo:
 * 1. Sử dụng cách tiếp cận giống như trong file test-transfer-hook.ts
 * 2. Kiểm tra lại tài liệu của Anchor về cách khởi tạo Program và gọi phương thức
 * 3. Tham khảo các file test khác trong dự án để xem cách họ khởi tạo AMM Config và Pool
 */ 