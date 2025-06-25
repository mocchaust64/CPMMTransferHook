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

// Transfer Hook program ID mới
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('12BZr6af3s7qf7GGmhBvMd46DWmVNhHfXmCwftfMk1mZ');

// Mint address của token
const MINT_ADDRESS = new PublicKey('6wVrNzXrDFpnMFzVYPsVoYRNZZ6YSqLDGNDvtQ5yqrqf'); // Thay thế bằng mint address thực tế của bạn

// Hàm để lấy PDA cho whiteList
async function getWhiteListPDA(programId: PublicKey, mintAddress: PublicKey): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("white_list"), mintAddress.toBuffer()],
    programId
  );
  return pda;
}

// Hàm xóa account khỏi whitelist
async function removeFromWhitelist(accountToRemove: PublicKey): Promise<string> {
  console.log('\n=== Xóa account khỏi whitelist ===');
  console.log('Account cần xóa:', accountToRemove.toString());
  console.log('Mint address:', MINT_ADDRESS.toString());
  
  // Lấy PDA cho whiteList với mint address
  const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID, MINT_ADDRESS);
  console.log('WhiteList PDA:', whiteListPDA.toString());
  
  // Tạo transaction để xóa account khỏi whitelist
  const removeFromWhitelistTx = new Transaction();
  
  // Tạo instruction data - discriminator cho removeFromWhitelist
  // Sử dụng discriminator mới từ IDL
  const instructionData = Buffer.from([7, 144, 216, 239, 243, 236, 193, 235]);
  
  // Tạo instruction để xóa account khỏi whitelist
  const removeFromWhitelistIx = {
    programId: TRANSFER_HOOK_PROGRAM_ID,
    keys: [
      { pubkey: accountToRemove, isSigner: false, isWritable: false }, // accountToRemove
      { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint address
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
    console.log('Account đã được xóa khỏi whitelist thành công');
    console.log('Transaction signature:', txSig);
    return txSig;
  } catch (error: any) {
    console.error('Lỗi khi xóa account khỏi whitelist:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    throw error;
  }
}

// Hàm chính để chạy test
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST XÓA ACCOUNT KHỎI WHITELIST ===');
    console.log('Payer address:', payer.publicKey.toString());
    console.log('Program ID:', TRANSFER_HOOK_PROGRAM_ID.toString());
    
    // Địa chỉ cần xóa khỏi whitelist - sử dụng địa chỉ cuối cùng trong danh sách
    const accountToRemove = new PublicKey('ChWWkybYBBRrwL3jJFMV1MF7kaEuptSspNc8cLB5SmXo');
    
    // Xóa account khỏi whitelist
    await removeFromWhitelist(accountToRemove);
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    
  } catch (error) {
    console.error('Lỗi khi test xóa account khỏi whitelist:', error);
  }
}

// Chạy test
runTest(); 