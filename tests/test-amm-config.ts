import * as anchor from '@coral-xyz/anchor';
import { Program, BN, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
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

// Hàm test chính
async function main() {
  console.log('=== BẮT ĐẦU TEST TẠO AMM CONFIG ===');
  
  // Đọc keypair từ file ~/.config/solana/id.json
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(keypairPath, { encoding: 'utf8' });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);
  
  console.log('Payer address:', payer.publicKey.toString());
  
  // Kết nối đến devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Tạo provider từ connection và payer
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed', skipPreflight: true }
  );
  anchor.setProvider(provider);
  
  try {
    // Import IDL từ file JSON
    const idlPath = path.join(__dirname, '../target/idl/raydium_cp_swap.json');
    const idlFile = fs.readFileSync(idlPath, 'utf8');
    const IDL = JSON.parse(idlFile);
    
    // Raydium CP Swap program ID
    const CP_SWAP_PROGRAM_ID = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
    
    // Khởi tạo program với IDL và program ID theo Anchor 0.31.0
    const program = new Program<RaydiumCpSwap>(IDL, CP_SWAP_PROGRAM_ID, provider);
    
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
    
  } catch (error) {
    console.error('Lỗi khi tạo AMM Config:', error);
  }
}

// Chạy test
main(); 