import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";

async function main() {
  try {
    // Kết nối đến devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Thiết lập provider
    const provider = new anchor.AnchorProvider(
      connection,
      anchor.Wallet.local(),
      { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    // Khởi tạo program
    const idl = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../target/idl/raydium_cp_swap.json'),
        'utf8'
      )
    );
    
    const program = new anchor.Program(idl, provider) as unknown as Program<RaydiumCpSwap>;
    
    // Địa chỉ pool cần kiểm tra
    const poolAddress = new PublicKey('8va9ryMnknRrHcEjyBieoPUwEa8eZnnYuEKEiQRcQNow');
    
    console.log('Đang kiểm tra thông tin pool:', poolAddress.toString());
    
    // Lấy thông tin pool
    const poolState = await program.account.poolState.fetch(poolAddress);
    
    // Hiển thị thông tin
    console.log('\n=== Thông tin Pool ===');
    console.log('AMM Config:', poolState.ammConfig.toString());
    console.log('Token0 Mint:', poolState.token0Mint.toString());
    console.log('Token1 Mint:', poolState.token1Mint.toString());
    console.log('Token0 Program:', poolState.token0Program.toString());
    console.log('Token1 Program:', poolState.token1Program.toString());
    console.log('Token0 Vault:', poolState.token0Vault.toString());
    console.log('Token1 Vault:', poolState.token1Vault.toString());
    console.log('LP Supply:', poolState.lpSupply.toString());
    
    // Kiểm tra số lượng token trong vault
    const token0Balance = await connection.getTokenAccountBalance(poolState.token0Vault);
    const token1Balance = await connection.getTokenAccountBalance(poolState.token1Vault);
    
    console.log('\n=== Số dư trong Vault ===');
    console.log('Token0 Balance:', token0Balance.value.amount, token0Balance.value.decimals, 'decimals');
    console.log('Token1 Balance:', token1Balance.value.amount, token1Balance.value.decimals, 'decimals');
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra pool:', error);
  }
}

main(); 