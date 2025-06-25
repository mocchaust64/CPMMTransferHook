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
    console.log('=== LIỆT KÊ CÁC ĐỊA CHỈ TRONG WHITELIST ===');
    console.log('Payer address:', payer.publicKey.toString());
    
    // Lấy PDA cho whiteList
    const whiteListPDA = await getWhiteListPDA(TRANSFER_HOOK_PROGRAM_ID);
    console.log('WhiteList PDA:', whiteListPDA.toString());
    
    // Lấy dữ liệu của account whitelist
    const accountInfo = await connection.getAccountInfo(whiteListPDA);
    if (!accountInfo) {
      console.log('Không tìm thấy account whitelist');
      return;
    }
    
    console.log('Account whitelist đã được tìm thấy');
    console.log('Kích thước dữ liệu:', accountInfo.data.length, 'bytes');
    
    // Phân tích dữ liệu account
    // Bỏ qua 8 byte đầu tiên (discriminator)
    const dataWithoutDiscriminator = accountInfo.data.slice(8);
    
    // Đọc authority (32 bytes đầu tiên sau discriminator)
    const authority = new PublicKey(dataWithoutDiscriminator.slice(0, 32));
    console.log('Authority:', authority.toString());
    
    // Đọc số lượng địa chỉ trong whitelist (4 bytes tiếp theo)
    const count = dataWithoutDiscriminator.readUInt32LE(32);
    console.log('Số lượng địa chỉ trong whitelist:', count);
    
    // Đọc các địa chỉ trong whitelist
    console.log('\nDanh sách các địa chỉ trong whitelist:');
    const addresses: string[] = [];
    for (let i = 0; i < count; i++) {
      const start = 36 + i * 32; // 8 (discriminator) + 32 (authority) + 4 (count) + i * 32
      const addressBytes = dataWithoutDiscriminator.slice(start, start + 32);
      const address = new PublicKey(addressBytes);
      console.log(`${i + 1}. ${address.toString()}`);
      addresses.push(address.toString());
    }
    
    // Lưu danh sách địa chỉ vào file để sử dụng sau này
    fs.writeFileSync('whitelist-addresses.json', JSON.stringify(addresses, null, 2));
    console.log('\nĐã lưu danh sách địa chỉ vào file whitelist-addresses.json');
    
  } catch (error) {
    console.error('Lỗi khi liệt kê các địa chỉ trong whitelist:', error);
  }
}

// Chạy test
runTest(); 