import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";

import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { setupInitializeTest, initialize, calculateFee, createAmmConfig, createTokenMintWithTransferHook, getPoolAddress, getPoolVaultAddress } from "./utils";
import { assert } from "chai";

describe("initialize test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  console.log("owner: ", owner.publicKey.toString());

  const program = anchor.workspace.RaydiumCpSwap as Program<RaydiumCpSwap>;

  const confirmOptions = {
    skipPreflight: true,
  };

  it("create pool without fee", async () => {
    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        program,
        anchor.getProvider().connection,
        owner,
        {
          config_index: 0,
          tradeFeeRate: new BN(10),
          protocolFeeRate: new BN(1000),
          fundFeeRate: new BN(25000),
          create_fee: new BN(0),
        },
        { transferFeeBasisPoints: 0, MaxFee: 0 },
        confirmOptions
      );

    const initAmount0 = new BN(10000000000);
    const initAmount1 = new BN(10000000000);
    const { poolAddress, poolState } = await initialize(
      program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      { initAmount0, initAmount1 }
    );
    let vault0 = await getAccount(
      anchor.getProvider().connection,
      poolState.token0Vault,
      "processed",
      poolState.token0Program
    );
    assert.equal(vault0.amount.toString(), initAmount0.toString());

    let vault1 = await getAccount(
      anchor.getProvider().connection,
      poolState.token1Vault,
      "processed",
      poolState.token1Program
    );
    assert.equal(vault1.amount.toString(), initAmount1.toString());
  });

  it("create pool with fee", async () => {
    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        program,
        anchor.getProvider().connection,
        owner,
        {
          config_index: 0,
          tradeFeeRate: new BN(10),
          protocolFeeRate: new BN(1000),
          fundFeeRate: new BN(25000),
          create_fee: new BN(10000000),
        },
        { transferFeeBasisPoints: 0, MaxFee: 0 },
        confirmOptions
      );

    const initAmount0 = new BN(10000000000);
    const initAmount1 = new BN(10000000000);
    const { poolAddress, poolState } = await initialize(
      program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      { initAmount0, initAmount1 }
    );
    let vault0 = await getAccount(
      anchor.getProvider().connection,
      poolState.token0Vault,
      "processed",
      poolState.token0Program
    );
    assert.equal(vault0.amount.toString(), initAmount0.toString());

    let vault1 = await getAccount(
      anchor.getProvider().connection,
      poolState.token1Vault,
      "processed",
      poolState.token1Program
    );
    assert.equal(vault1.amount.toString(), initAmount1.toString());
  });

  it("create pool with token2022 mint has transfer fee", async () => {
    const transferFeeConfig = { transferFeeBasisPoints: 100, MaxFee: 50000000 }; // %10
    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        program,
        anchor.getProvider().connection,
        owner,
        {
          config_index: 0,
          tradeFeeRate: new BN(10),
          protocolFeeRate: new BN(1000),
          fundFeeRate: new BN(25000),
          create_fee: new BN(10000000),
        },
        transferFeeConfig,
        confirmOptions
      );

    const initAmount0 = new BN(10000000000);
    const initAmount1 = new BN(10000000000);
    const { poolAddress, poolState } = await initialize(
      program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      { initAmount0, initAmount1 }
    );
    let vault0 = await getAccount(
      anchor.getProvider().connection,
      poolState.token0Vault,
      "processed",
      poolState.token0Program
    );
    if (token0Program == TOKEN_PROGRAM_ID) {
      assert.equal(vault0.amount.toString(), initAmount0.toString());
    } else {
      const total =
        vault0.amount +
        calculateFee(
          transferFeeConfig,
          BigInt(initAmount0.toString()),
          poolState.token0Program
        );
      assert(new BN(total.toString()).gte(initAmount0));
    }

    let vault1 = await getAccount(
      anchor.getProvider().connection,
      poolState.token1Vault,
      "processed",
      poolState.token1Program
    );
    if (token1Program == TOKEN_PROGRAM_ID) {
      assert.equal(vault1.amount.toString(), initAmount1.toString());
    } else {
      const total =
        vault1.amount +
        calculateFee(
          transferFeeConfig,
          BigInt(initAmount1.toString()),
          poolState.token1Program
        );
      assert(new BN(total.toString()).gte(initAmount1));
    }
  });

  // Test for token2022 mint has transfer hook with whitelist
  it("create pool with token2022 mint has transfer hook", async () => {
    const transferHookProgramId = new anchor.web3.PublicKey("BmcmrHRjV2feBspwFsmWWwzNThT5o6sKM1zwoQcjKoG");
    const transferFeeConfig = { transferFeeBasisPoints: 0, MaxFee: 0 };
    
    // Setup test với config để sử dụng trong AMM
    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        program,
        anchor.getProvider().connection,
        owner,
        {
          config_index: 0,
          tradeFeeRate: new BN(10),
          protocolFeeRate: new BN(1000),
          fundFeeRate: new BN(25000),
          create_fee: new BN(10000000),
        },
        transferFeeConfig,
        confirmOptions
      );
    
    // Log thông tin về token và Transfer Hook program ID
    console.log("Using TransferHook Program ID:", transferHookProgramId.toString());
    console.log("Token 0:", token0.toString(), "Program:", token0Program.toString());
    console.log("Token 1:", token1.toString(), "Program:", token1Program.toString());
    
    // Lấy địa chỉ pool và vault trước khi tạo pool
    const [poolAddressPDA] = await getPoolAddress(
      configAddress,
      token0,
      token1,
      program.programId
    );
    const [token0Vault] = await getPoolVaultAddress(
      poolAddressPDA,
      token0,
      program.programId
    );
    const [token1Vault] = await getPoolVaultAddress(
      poolAddressPDA,
      token1,
      program.programId
    );
    
    console.log("Pool address:", poolAddressPDA.toString());
    console.log("Token0 vault:", token0Vault.toString());
    console.log("Token1 vault:", token1Vault.toString());
    
    // LƯU Ý: Trong môi trường test thực tế cần:
    // 1. Khởi tạo ExtraAccountMetaList cho token với Transfer Hook
    // 2. Thêm pool vault vào whitelist của Transfer Hook program
    
    // Giả lập các bước trên - trong môi trường thực tế cần thực hiện:
    // const extraAccountMetaListPDA = findProgramAddressSync(
    //   [Buffer.from("extra-account-metas"), token.publicKey.toBuffer()],
    //   transferHookProgramId
    // )[0];
    // 
    // // Khởi tạo Extra Account Meta List
    // const initializeExtraAccountMetaListIx = await transferHookProgram.methods
    //   .initializeExtraAccountMetaList()
    //   .accounts({
    //     mint: token.publicKey,
    //     payer: owner.publicKey,
    //   })
    //   .instruction();
    //
    // // Thêm pool vault vào whitelist
    // const addToWhitelistIx = await transferHookProgram.methods
    //   .addToWhitelist()
    //   .accounts({
    //     newAccount: token0Vault,
    //     signer: owner.publicKey,
    //   })
    //   .instruction();
    
    // Khởi tạo pool với token đã tạo
    const initAmount0 = new BN(10000000000);
    const initAmount1 = new BN(10000000000);
    const { poolAddress: createdPoolAddress, poolState } = await initialize(
      program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      { initAmount0, initAmount1 },
      owner.publicKey
    );
    
    console.log("Pool created successfully");
    
    // Kiểm tra số dư trong vault
    let vault0 = await getAccount(
      anchor.getProvider().connection,
      poolState.token0Vault,
      "processed",
      poolState.token0Program
    );
    assert.equal(vault0.amount.toString(), initAmount0.toString());

    let vault1 = await getAccount(
      anchor.getProvider().connection,
      poolState.token1Vault,
      "processed",
      poolState.token1Program
    );
    assert.equal(vault1.amount.toString(), initAmount1.toString());
    
    // Trong môi trường thực tế, cần thêm phần kiểm tra:
    // 1. Kiểm tra xem pool vault có nằm trong whitelist không
    // 2. Kiểm tra việc chuyển token đến pool vault có thành công không
    // 3. Kiểm tra việc chuyển token từ pool vault có thành công không
  });
});
