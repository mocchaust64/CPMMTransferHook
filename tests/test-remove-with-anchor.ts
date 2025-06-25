import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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

// Đường dẫn đến file IDL
const idlPath = path.join(__dirname, '../../white_list/target/idl/transfer_hook.json');
const idlFile = fs.readFileSync(idlPath, 'utf8');
const idl = JSON.parse(idlFile);

// Hàm để lấy PDA cho whiteList
async function getWhiteListPDA(programId: PublicKey): Promise<PublicKey> {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("white_list")],
    programId
  );
  return pda;
}

// Hàm chính để chạy test
async function runTest() {
  try {
    console.log('=== BẮT ĐẦU TEST XÓA ACCOUNT KHỎI WHITELIST BẰNG ANCHOR ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Tạo provider từ connection và payer
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', skipPreflight: true }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program với IDL và program ID theo Anchor 0.31.0
    const program = anchor.workspace.TransferHook;
    
    // Lấy PDA cho whiteList
    const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
    console.log('WhiteList PDA:', whiteListPDA.toString());
    
    // Địa chỉ cần xóa khỏi whitelist
    const accountToRemove = new PublicKey('ChWWkybYBBRrwL3jJFMV1MF7kaEuptSspNc8cLB5SmXo');
    console.log('Account cần xóa:', accountToRemove.toString());
    
    // Gọi hàm removeFromWhitelist của program
    const tx = await program.methods
      .removeFromWhitelist()
      .accounts({
        accountToRemove: accountToRemove,
        whiteList: whiteListPDA,
        signer: payer.publicKey
      })
      .rpc();
    
    console.log('Transaction signature:', tx);
    console.log('Account đã được xóa khỏi whitelist thành công');
    
    console.log('\n=== TEST HOÀN THÀNH THÀNH CÔNG ===');
    
  } catch (error: any) {
    console.error('Lỗi khi test xóa account khỏi whitelist:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

// Chạy test
runTest(); 