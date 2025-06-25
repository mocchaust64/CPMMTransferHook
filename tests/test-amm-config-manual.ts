import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

// Hàm để chuyển số BigInt thành Uint8Array 8 bytes (little-endian)
function u64ToLEBytes(num: bigint): Uint8Array {
  const arr = new ArrayBuffer(8);
  const view = new DataView(arr);
  view.setBigUint64(0, num, true); // true for little-endian
  return new Uint8Array(arr);
}

// Hàm test chính
async function main() {
  console.log('=== BẮT ĐẦU TEST TẠO AMM CONFIG (MANUAL) ===');
  
  // Đọc keypair từ file ~/.config/solana/id.json
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);
  
  console.log('Payer address:', payer.publicKey.toString());
  
  // Kết nối đến devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    // Raydium CP Swap program ID
    const CP_SWAP_PROGRAM_ID = new PublicKey('WFHgqbEBAESXYu9EWcnpDcLoG9L5kDyQJjCG3a5AGqL');
    
    // Lấy PDA cho AMM Config
    const configIndex = 0;
    const [ammConfigAddress, _] = await getAmmConfigAddress(configIndex, CP_SWAP_PROGRAM_ID);
    console.log('AMM Config address:', ammConfigAddress.toString());
    
    // Tạo dữ liệu cho instruction thủ công
    // Discriminator cho createAmmConfig
    const discriminator = Buffer.from([136, 75, 255, 190, 102, 129, 188, 134]);
    
    // Tạo buffer cho dữ liệu
    const dataBuffer = Buffer.alloc(2 + 8 + 8 + 8 + 8); // u16 + 4 * u64
    
    // Ghi index (u16)
    dataBuffer.writeUInt16LE(configIndex, 0);
    
    // Ghi tradeFeeRate (u64)
    const tradeFeeRate = u64ToLEBytes(BigInt(25));
    tradeFeeRate.forEach((byte, i) => dataBuffer[2 + i] = byte);
    
    // Ghi protocolFeeRate (u64)
    const protocolFeeRate = u64ToLEBytes(BigInt(10000));
    protocolFeeRate.forEach((byte, i) => dataBuffer[2 + 8 + i] = byte);
    
    // Ghi fundFeeRate (u64)
    const fundFeeRate = u64ToLEBytes(BigInt(5));
    fundFeeRate.forEach((byte, i) => dataBuffer[2 + 16 + i] = byte);
    
    // Ghi createPoolFee (u64)
    const createPoolFee = u64ToLEBytes(BigInt(0));
    createPoolFee.forEach((byte, i) => dataBuffer[2 + 24 + i] = byte);
    
    // Kết hợp discriminator và dữ liệu
    const data = Buffer.concat([discriminator, dataBuffer]);
    
    // Tạo instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // owner
        { pubkey: ammConfigAddress, isSigner: false, isWritable: true }, // ammConfig
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
      ],
      programId: CP_SWAP_PROGRAM_ID,
      data,
    });
    
    // Tạo và gửi transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { skipPreflight: true }
    );
    
    console.log('AMM Config đã được tạo thành công');
    console.log('Transaction signature:', signature);
    
  } catch (error) {
    console.error('Lỗi khi tạo AMM Config:', error);
  }
}

// Chạy test
main(); 