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

// Danh sách các địa chỉ cần xóa khỏi whitelist
// Đây là các địa chỉ đã được thêm vào whitelist từ các test trước đó
const addressesToRemove = [
  // Thêm các địa chỉ cần xóa vào đây
  new PublicKey('BTTcs7rG88AC9kvhzjg3TA4dK6KsFDNoLmegKskps5Zk'),
  new PublicKey('BX4NKpjomUfGYSi6gt8HvPDAJEUyy5PADPtDXuGzBDVR'),
  new PublicKey('6TMWrk7XYRFpBuNvp2pM7Fz4KdxLwqkyUPaqxAizZLRy'),
  // Thêm các địa chỉ khác nếu cần
];

// Hàm xóa account khỏi whitelist
async function removeAccountFromWhitelist(accountToRemove: PublicKey): Promise<string> {
  console.log('\n=== Xóa account khỏi whitelist ===');
  console.log('Account cần xóa:', accountToRemove.toString());
  
  // Lấy PDA cho whiteList
  const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
  
  // Tạo transaction để xóa account khỏi whitelist
  const removeFromWhitelistTx = new Transaction();
  
  // Tạo instruction data
  const instructionData = Buffer.from([99, 172, 220, 201, 77, 132, 159, 124]); // Discriminator cho removeFromWhitelist
  
  // Tạo instruction để xóa account khỏi whitelist
  const removeFromWhitelistIx = {
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: accountToRemove, isSigner: false, isWritable: false }, // accountToRemove
      { pubkey: whiteListPDA, isSigner: false, isWritable: true }, // whiteList
      { pubkey: payer.publicKey, isSigner: true, isWritable: true } // signer
    ],
    data: instructionData
  };
  
  removeFromWhitelistTx.add(removeFromWhitelistIx);
  
  try {
    const txSig = await sendAndConfirmTransaction(
      connection,
      removeFromWhitelistTx,
      [payer],
      { skipPreflight: false } // Đặt false để xem logs chi tiết
    );
    console.log('Account đã được xóa khỏi whitelist thành công');
    console.log('Transaction signature:', txSig);
    return txSig;
  } catch (error: any) {
    console.error('Lỗi khi xóa account khỏi whitelist:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    return '';
  }
}

// Hàm test chính
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST XÓA ACCOUNT KHỎI WHITELIST ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Xóa từng địa chỉ khỏi whitelist
    for (const address of addressesToRemove) {
      await removeAccountFromWhitelist(address);
    }
    
    console.log('\n=== TEST HOÀN THÀNH ===');
    console.log('Đã xóa các địa chỉ khỏi whitelist');
    
  } catch (error) {
    console.error('Lỗi khi test xóa account khỏi whitelist:', error);
  }
}

// Chạy test
runTest(); 