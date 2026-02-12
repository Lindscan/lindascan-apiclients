const buildWithdrawBalance = require("../src/utils/transactionBuilder").buildWithdrawBalance;
const buildUnfreezeBalance = require("../src/utils/transactionBuilder").buildUnfreezeBalance;
const buildFreezeBalance = require("../src/utils/transactionBuilder").buildFreezeBalance;
const byteArray2hexStr = require("../src/utils/bytes").byteArray2hexStr;
const buildVote = require("../src/utils/transactionBuilder").buildVote;
const { assert } = require('chai');

describe('transactionBuilder', () => {

  it('build voteContract', async () => {
    let transaction = buildVote("LUsbRTJ9pcTynuULhSnoDAiCu48oW8HaFu", {
      "LUsbRTJ9pcTynuULhSnoDAiCu48oW8HaFu": 100
    });

    console.log("hex", byteArray2hexStr(transaction.getRawData().serializeBinary()));
  });

  it('build freeze', async () => {
    let transaction = buildFreezeBalance("LUsbRTJ9pcTynuULhSnoDAiCu48oW8HaFu", 100000000, 3);
    console.log("hex", byteArray2hexStr(transaction.getRawData().serializeBinary()));
  });

  it('build unfreeze', async () => {
    let transaction = buildUnfreezeBalance("LUsbRTJ9pcTynuULhSnoDAiCu48oW8HaFu");
    console.log("hex", byteArray2hexStr(transaction.getRawData().serializeBinary()));
  });

  it('build withdraw', async () => {
    let transaction = buildWithdrawBalance("LUsbRTJ9pcTynuULhSnoDAiCu48oW8HaFu");
    console.log("hex", byteArray2hexStr(transaction.getRawData().serializeBinary()));
  });

});
