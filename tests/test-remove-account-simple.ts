import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
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

// Hàm xóa account khỏi whitelist
async function removeFromWhitelist(accountToRemove: PublicKey): Promise<void> {
  console.log('\n=== Xóa account khỏi whitelist ===');
  console.log('Account cần xóa:', accountToRemove.toString());
  
  // Lấy PDA cho whiteList
  const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
  console.log('WhiteList PDA:', whiteListPDA.toString());
  
  // Tạo transaction để xóa account khỏi whitelist
  const removeFromWhitelistTx = new Transaction();
  
  // Discriminator cho removeFromWhitelist
  // Thử với discriminator khác
  const instructionData = Buffer.from([
    // 'remove_from_whitelist' encoded
    114, 101, 109, 111, 118, 101, 95, 102, 114, 111, 109, 95, 119, 104, 105, 116, 101, 108, 105, 115, 116
  ]);
  
  // Tạo instruction để xóa account khỏi whitelist
  const removeFromWhitelistIx = {
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: accountToRemove, isSigner: false, isWritable: false }, // accountToRemove
      { pubkey: whiteListPDA, isSigner: false, isWritable: true }, // whiteList
      { pubkey: payer.publicKey, isSigner: true, isWritable: true } // signer (authority)
    ],
    data: instructionData
  };
  
  removeFromWhitelistTx.add(removeFromWhitelistIx);
  
  try {
    const txSig = await sendAndConfirmTransaction(
      connection,
      removeFromWhitelistTx,
      [payer],
      { skipPreflight: false }
    );
    console.log('Transaction signature:', txSig);
    console.log('Account đã được xóa khỏi whitelist thành công');
  } catch (error: any) {
    console.error('Lỗi khi xóa account khỏi whitelist:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

// Hàm chính để chạy test
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST XÓA ACCOUNT KHỎI WHITELIST ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Địa chỉ cần xóa khỏi whitelist
    const accountToRemove = new PublicKey('ChWWkybYBBRrwL3jJFMV1MF7kaEuptSspNc8cLB5SmXo');
    
    // Xóa account khỏi whitelist
    await removeFromWhitelist(accountToRemove);
    
    console.log('\n=== TEST HOÀN THÀNH ===');
    
  } catch (error) {
    console.error('Lỗi khi test xóa account khỏi whitelist:', error);
  }
}

// Chạy test
runTest(); 