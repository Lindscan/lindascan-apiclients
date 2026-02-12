const xhr = require("axios");
const {
  buildTransferTransaction, buildVote, buildAssetParticipate, buildFreezeBalance, buildAssetIssue,
  buildUnfreezeBalance, buildAccountUpdate, buildWitnessUpdate, buildWithdrawBalance, buildWitnessCreate,
  buildUnfreezeAsset, buildExchangeCreate, buildExchangeInject, buildExchangeWithdraw, buildTransactionExchange,
  buildTransferHexStr, buildTriggerSmartContract, getTriggerSmartContractParameterValue, getTransferContractParameterValue,
  getTransferAssetContractParameterValue, getAccountPermissionUpdateContractParameterValue
} = require("../utils/transactionBuilder");
const { hexStr2byteArray } = require("../lib/code");
const PrivateKeySigner = require("../signer/privateKeySigner");
const encodeString = require("../lib/code").encodeString;
const pkToAddress = require("../utils/crypto").pkToAddress;

function longToByteArray(/*long*/long) {
  // we want to represent the input as a 8-bytes array
  var byteArray = [0, 0, 0, 0, 0, 0, 0, 0];

  for (var index = 0; index < byteArray.length; index++) {
    var byte = long & 0xff;
    byteArray[index] = byte;
    long = (long - byte) / 256;
  }

  return byteArray;
}

function byteArrayToLong(/*byte[]*/byteArray) {
  var value = 0;
  for (var i = byteArray.length - 1; i >= 0; i--) {
    value = (value * 256) + byteArray[i];
  }

  return value;
}

class ApiClient {

  constructor(url, headerKey) {
    this.apiUrl = url;
    this.signer = null;
    this.sendHeader = {

    }
    this.headerKey = headerKey || ''
    if (this.headerKey) {
      this.sendHeader = {
        'Content-Type': 'application/json',
        'LINDA-PRO-API-KEY': headerKey,
      }
    }
  }

  sendHeaderFun(secret) {
    let newHeader = this.sendHeader
    if (secret && (Object.prototype.toString.call(secret) == '[object Object]') && Object.keys(secret).length > 0) {
      if (secret.Secret && secret.signTime) {
        newHeader.Secret = secret.Secret;
        newHeader.T = secret.signTime;
      }
      delete newHeader['LINDA-PRO-API-KEY'];
    }
    return newHeader
  }


  setSigner(signer) {
    this.signer = signer;
  }

  send(token, from, to, amount) {
    let transaction = buildTransferTransaction(token, from, to, amount);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  getSendHexStr(token, from, to, amount) {
    let hexStr = buildTransferHexStr(token, from, to, amount);
    return hexStr;
  }


  sendWithNote(token, from, to, amount, note) {
    let transaction = buildTransferTransaction(token, from, to, amount);
    if (note.length > 0) {
      let rawData = transaction.getRawData();
      rawData.setData(encodeString(encodeURIComponent(note)));
      transaction.setRawData(rawData);
    }

    return (pk) => this.sendTransaction(pk, transaction);
  }

  async addRef(transaction) {

    let latestBlock = await this.getLatestBlock();

    let latestBlockHash = latestBlock.hash;
    let latestBlockNum = latestBlock.number;

    let numBytes = longToByteArray(latestBlockNum);
    numBytes.reverse();
    let hashBytes = hexStr2byteArray(latestBlockHash);

    let generateBlockId = [...numBytes.slice(0, 8), ...hashBytes.slice(8, hashBytes.length - 1)];

    let rawData = transaction.getRawData();
    rawData.setRefBlockHash(Uint8Array.from(generateBlockId.slice(8, 16)));
    rawData.setRefBlockBytes(Uint8Array.from(numBytes.slice(6, 8)));
    rawData.setExpiration(latestBlock.timestamp + (60 * 5 * 1000));

    transaction.setRawData(rawData);
    return transaction;
  }

  getSigner(pk) {
    return this.signer || new PrivateKeySigner(pk);
  }

  async sendTransaction(pk, transaction) {
    transaction = await this.addRef(transaction);
    let privateKeySigner = this.getSigner(pk);
    let { hex } = await privateKeySigner.signTransaction(transaction);
    let { data } = await xhr.post(`${this.apiUrl}/api/broadcast`, {
      transaction: hex,
    }, {
      headers: this.sendHeader
    });

    return data;
  }

  async sendTransactionRaw(transactionHex, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/api/broadcast`, {
      transaction: transactionHex,
    }, {
      headers: this.sendHeaderFun(secret)
    });

    return data;
  }

  async auth(pk, secret) {
    let transaction = buildWitnessUpdate(pkToAddress(pk), "UPDATE_SR");
    let privateKeySigner = this.getSigner(pk);
    let { hex } = await privateKeySigner.signTransaction(transaction);
    let { data } = await xhr.post(`${this.apiUrl}/api/auth`, {
      transaction: hex,
    }, {
      headers: this.sendHeaderFun(secret)
    });

    return data.key;
  }

  async updateSuperRepresentative(key, sr, secret) {
    let header = this.headerKey?{
      "X-Key": key,
      'LINDA-PRO-API-KEY': this.headerKey
    } : {
      "X-Key": key,
      }
    if (secret) {
      header.Secret = secret;
      delete header['LINDA-PRO-API-KEY'];
    }
    await xhr.post(`${this.apiUrl}/api/account/${sr.address}/sr`, sr, {
      headers: header
    });
  }

  async getSuperRepresentative(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/sr?address=` + address, {
      headers: this.sendHeaderFun(secret)
    }
    );
    return data;
  }

  updateAccountName(address, name) {
    let transaction = buildAccountUpdate(address, name);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  updateWitnessUrl(address, url) {
    let transaction = buildWitnessUpdate(address, url);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  withdrawBalance(address) {
    let transaction = buildWithdrawBalance(address);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  freezeBalance(address, amount, duration, resource, receiver) {
    let transaction = buildFreezeBalance(address, amount, duration, resource, receiver);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  unfreezeBalance(address, resource, receiver) {
    let transaction = buildUnfreezeBalance(address, resource, receiver);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  unfreezeAssets(address) {
    let transaction = buildUnfreezeAsset(address);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  applyForDelegate(address, url) {
    let transaction = buildWitnessCreate(address, url);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  voteForWitnesses(address, votes) {
    let transaction = buildVote(address, votes);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  participateAsset(address, issuerAddress, token, amount) {
    let transaction = buildAssetParticipate(address, issuerAddress, token, amount);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  createToken(options) {
    let transaction = buildAssetIssue(options);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  createExchange(address, firstTokenID, secondTokenId, firstTokenBalance, secondTokenBalance) {
    let transaction = buildExchangeCreate(address, firstTokenID, secondTokenId, firstTokenBalance, secondTokenBalance);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  injectExchange(address, exchangeId, tokenId, quant) {
    let transaction = buildExchangeInject(address, exchangeId, tokenId, quant);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  withdrawExchange(address, exchangeId, tokenId, quant) {
    let transaction = buildExchangeWithdraw(address, exchangeId, tokenId, quant);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  transactionExchange(address, exchange_id, token_id, quant, expected) {
    let transaction = buildTransactionExchange(address, exchange_id, token_id, quant, expected);
    return (pk) => this.sendTransaction(pk, transaction);
  }

  async getBlocks(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/block`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      blocks: data.data,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getLatestBlock(secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/block/latest`, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async getTransactions(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/transaction`, {
      params:  options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      transactions: data.data,
      contractMap: data.contractMap,
      contractInfo: data.contractInfo,
      total: data.total,
      rangeTotal: data.rangeTotal,
      wholeChainTxCount: data.wholeChainTxCount
    };
  }

  async getTransfers(options = {},secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/transfer`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      transfers: data.data,
      contractMap: data.contractMap,
      contractInfo: data.contractInfo,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getParticipateProject( options = {}, secret) {
    let data = await xhr.get(`${this.apiUrl}/api/participate_project`,
      {
        params: options,
        headers: this.sendHeaderFun(secret)
      })
    return data

  }

  async getBlockByNumber(options = {}, secret) {
    let { blocks } = await this.getBlocks(options, secret);

    return blocks[0];
  }

  async getBlockByHash(options = {}, secret) {
    let { blocks } = await this.getBlocks(options, secret);

    return blocks[0];
  }

  async getTransactionByHash(options, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/transaction-info`,
      {
        params: options,
        headers: this.sendHeaderFun(secret)
      })
    return data;
  }


  async getIssuedAsset(params = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return {
      token: data.data[0],
      data,
    };
  }

  async getAccounts(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/list`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      accounts: data.data,
      contractMap: data.contractMap,
      contractInfo: data.contractInfo,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getVotes(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote`, {
      params: Object.assign({
        sort: '-timestamp',
        limit: 50,
      }, options),
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      votes: data.data,
      total: data.total,
      totalVotes: data.totalVotes,
    };
  }

  async secondsUntilNextCycle(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/next-cycle`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data.nextCycle / 1000;
  }


  async getAccountByAddress(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/${address}`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getRichList(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/richlist`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getVotesForCurrentCycle(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/current-cycle`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getVotesList(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/witness`,
      {
        headers: this.sendHeaderFun(secret)
      })
    return data
  }

  async getLiveVotes(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/live`,
      {
        headers: this.sendHeaderFun(secret)
      })
    return data.data;
  }

  async getTransferStats(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/transfer/stats`, {
      params: Object.assign({}, options),
      headers: this.sendHeaderFun(secret)
    });

    return {
      stats: data,
    };
  }

  async getBlockStats(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/block/stats`, {
      params: Object.assign({}, options),
      headers: this.sendHeaderFun(secret)
    });

    return {
      stats: data,
    };
  }

  async getAddress(options = {}, secret ) {
    let { data } = await xhr.get(`${this.apiUrl}/api/accountv2`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    })
    return data;
  }

  async getAddressMedia(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/${address}/media`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getAddressStats(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/stats?address=` + address,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getTokens(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      ...data,
      tokens: data.data,
      total: data.total,
    }
  }

  async getAccountVotes(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/votes?address=` + address,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getToken(name,secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token/${name}`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getTokenHolders(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/tokenholders`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      addresses: data.data,
      total: data.total,
      rangeTotal: data.rangeTotal,
      contractMap: data.contractMap
    };
  }

  async getWitnesses(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/witness`,
      {
        headers: this.sendHeaderFun(secret)
      });

    return {
      ...data,
      witnesses: data,
      total: data.length,
    };
  }

  async getNodeLocations(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/nodemap`,
      {
        headers: this.sendHeaderFun(secret)
      });

    return {
      nodes: data,
      total: data.length,
    };
  }

  async getNodes(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/node`,
      {
        headers: this.sendHeaderFun(secret)
      });

    return {
      ...data,
      nodes: data.nodes,
      total: data.nodes.length,
      status: data.status,
    };
  }

  async getAccountBalances(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/${address}/balance`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getSystemStatus(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/system/status`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getMarkets(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/market/markets`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async readTransaction(data = {}, secret) {
    let { data:newData } = await xhr.post(`${this.apiUrl}/api/transaction?dry-run`, {
      ...data,
    },
      {
        headers: this.sendHeaderFun(secret)
      });
    return newData;
  }

  async readTransactionNew(data = {}, secret) {
    let { data: newData } = await xhr.post(`${this.apiUrl}/api/transaction?dry-run=1`, {
      ...data,
    },
      {
        headers: this.sendHeaderFun(secret)
      });
    return newData;
  }

  async getVoteStats(params = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/stats`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data.results;
  }

  async getTxOverviewStats(params = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/stats/overview`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return {
      ...data,
      txOverviewStats: data.data
    }
  }

  async getTxOverviewStatsAll(number, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/stats/overview?days=${number}`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return {
      ...data,
      txOverviewStats: data.data
    }
  }

  async getStatisticData(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/witness/maintenance-statistic`,
      {
        headers: this.sendHeaderFun(secret)
      });
    return {
      statisticData: data
    }
  }

  async getVoteWitness(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/vote/witness?address=` + address,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data
  }

  async contractsVerify(verifyData, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/api/contracts/verify`, verifyData,
      {
        headers: this.sendHeaderFun(secret)
      });
    return data;
  }

  async getContracts(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contracts`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return data;
  }

  async getContractTxs(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contracts/transaction`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return data;
  }

  async getContractOverview(options = {}, secret) {
    // let {data} = await xhr.get(`${this.apiUrl}/api/contract?contract=` + address);
    let { data } = await xhr.get(`${this.apiUrl}/api/contract`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    })
    return data;
  }

  async getContractCode(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contracts/code?contract=${address}`, {
      headers: this.sendHeaderFun(secret)
    });

    return data;
  }

  async getContractEvent(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contracts/event?contract=${address}`, {
      headers: this.sendHeaderFun(secret)
    });

    return data;
  }


  async getContractTriggers(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contracts/trigger`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      triggers: data.data,
      contractInfo: data.contractInfo,
      contractMap: data.contractMap,
      total: data.total,
      rangeTotal: data.rangeTotal
    };
  }

  async getAccountByAddressNew(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/accountv2?address=` + address, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async getExchangesList(options = {}) {
    let { data } = await xhr.get(`https://bancor.trx.market/api/exchanges/list`, {
      params: options,
    });
    return data;
  }

  async exchange(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/api/exchange/transaction`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async getExchangesKline(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/exchange/kgraph`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return data
  }


  async getTransactionList(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/exchange/transaction`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return data
  }

  async getChainparameters(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/chainparameters`, {
      headers: this.sendHeaderFun(secret)
    });
    return {
      ...data,
      lindaParameters: data.lindaParameters,
    }
  }

  async getProposalList(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/proposal`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      ...data,
      proposal: data.data,
      total: data.total
    }
  }

  async getProposalById(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/proposal`, {
      params:options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      data: data
    }
  }

  async getHolderBalance(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token_lrc20/holder_balance`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return data
  }

  async getexchangesAllList(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/exchanges/listall`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      exchangesAllList: data
    }
  }

  async getFundsSupply(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/funds`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      funds: data
    }
  }

  async getBttFundsSupply(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/bittorrent/fund`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      funds: data
    }
  }

  async getlistdonators(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/listdonators`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });
    return {
      list: data
    }
  }

  async getNotices(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/announcement`, {
      params: Object.assign({ type: 1, start: 0, limit: 10, status: 0 }, options),
      headers: this.sendHeaderFun(secret)
    });
    return data
  }


  async getLRC20tfs(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contract/events`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      list: data.data,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getAddressTokens(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/tokens`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      data
    };
  }

  async getInternalTransaction(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/internal-transaction`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      list: data.data,
      contractMap: data.contractMap,
      contractInfo: data.contractInfo,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getAssetTransfers(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/asset/transfer`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      list: data.Data,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getTokenLRC20Transfers(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token_lrc20/transfers`, {
      params: options,
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      list: data.token_transfers,
      contractInfo: data.contractInfo,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getTransfersAll(options = {}, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/lrc10lrc20-transfer`, {
      params: Object.assign({
        sort: '-timestamp',
        count: true,
        limit: 50,
      }, options),
      headers: this.sendHeaderFun(secret)
    });

    return {
      ...data,
      transfers: data.transfers,
      contractMap: data.contractMap,
      total: data.total,
      rangeTotal: data.rangeTotal,
    };
  }

  async getContractInfo(address, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/contract?contract=${address}`, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async createToken20(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc20tokens`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async createToken1155(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc1155tokens`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async createToken721(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc721tokens`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async updateToken721(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc721tokens/update`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async updateToken1155(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc1155tokens/update`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async updateToken20(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc20tokens/update`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async updateToken10(options = {}, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/lrc10tokens/update`, options, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }


  async getTps(time, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/system/tps?time=${time}`, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async getTagNameList() {
    return [
      {
        name: 'binance', addressList: {
          Cold: ['TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9', 'TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb'],
          Hot: ['TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX']
        }
      }, {
        name: 'Upbit', addressList: {
          Hot: ['TDU1uJNxDND9zhzYjnn7ZunHj18jw7oAca']
        }
      }, {
        name: 'Okex', addressList: {
          default: ['TM1zzNDZD2DPASbKcgdVoTYhfmYgtfwx9R', 'TS1P2y41FEaxvNNktvriTbjKHpQPKoRvic']
        }
      }, {
        name: 'Huobi', addressList: {
          default: ['TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR']
        }
      }, {
        name: 'Bittrex', addressList: {
          Hot: ['TAahLbGTZk6YuCycii72datPQEtyC5x231'],
          default: ['TA5vCXk4f1SrCMfz361UxUNABRGP1g2F1r']
        }
      }, {
        name: 'Kucoin', addressList: {
          default: ['TLWE45u7eusdewSDCjZqUNmyhTUL1NBMzo', 'TBcUJq55x7Q83ZSr2AqWj59TRj2LvxVr8a']
        }
      }, {
        name: 'Gate', addressList: {
          default: ['TBA6CypYJizwA9XdC7Ubgc5F1bxrQ7SqPt']
        }
      }, {
        name: 'poloniex', addressList: {
          default: ['TNCmcTdyrYKMtmE1KU2itzeCX76jGm5Not']
        }
      },
      {
        name: 'bitfinex', addressList: {
          default: ['TXFBqBbqJommqZf7BV8NNYzePh97UmJodJ']
        }
      }
    ];
  }
  async getCountByType(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/count`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  async getUserList(params, secret) {
    let { data } = await xhr.post(`https://lindascan.org/users/getUserList`, params, {
      headers: this.sendHeaderFun(secret)
    });

    return {
      data: data.data,
      total: data.total,
    };
  }
  async getAddressReward(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/address/reward`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  getTriggerSmartContractHexStr(value) {
    let hexStr = buildTriggerSmartContract(value);
    return hexStr;
  }

  getParameterValue(hexStr, ContractType) {
    let hexStrBytes = hexStr2byteArray(hexStr);
    let parameterValue;
    let parameter = {};
    switch (ContractType) {
      case "TransferContract": {
        parameterValue = getTransferContractParameterValue(hexStrBytes)
        return parameterValue;
      }
      case "TransferAssetContract": {
        parameterValue = getTransferAssetContractParameterValue(hexStrBytes)
        return parameterValue;
      }
      case "TriggerSmartContract": {
        parameterValue = getTriggerSmartContractParameterValue(hexStrBytes)
        for (let i in parameterValue) {
          if (parameterValue[i] !== '') {
            parameter[i] = parameterValue[i]
          }
        }
        return parameter;
      }
      case "AccountPermissionUpdateContract": {
        // let contractData = await xhr.post(`https://lindaexapi.lindascan.org/api/contract/convert`, {
        //   "outType":"json",
        //   "data":hexStr,
        //   "contractType":ContractType
        // });
        // parameterValue =  contractData.data.message
        parameterValue = getAccountPermissionUpdateContractParameterValue(hexStrBytes)
        for (let i in parameterValue) {
          if (parameterValue[i] !== '') {
            parameter[i] = parameterValue[i]
          }
        }
        return parameter;
      }

    }
  }

  /*
  * get account token list
  */
  async getAccountWallet(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/wallet`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  * get search token
  */
  async getAccountTokenSearch(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token/search`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  ** account add  show token list
  */
  async getAccountAddShowList(params, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/account/addShowList`, params, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }


  /*
  ** account add  show block list
  */
  async getAccountAddBlockList(params, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/account/addBlockList`, params, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  ** tvc total value on chain
  */
  async getTVCData(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/tokenTvc`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  * get account token list
  */
  async getAccountWallet(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/account/wallet`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  * get search token
  */
  async getAccountTokenSearch(params, secret) {
    let { data } = await xhr.get(`${this.apiUrl}/api/token/search`, {
      params,
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }

  /*
  ** account add  show token list
  */
  async getAccountAddShowList(params, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/account/addShowList`, params, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }


  /*
  ** account add  show block list
  */
  async getAccountAddBlockList(params, secret) {
    let { data } = await xhr.post(`${this.apiUrl}/external/account/addBlockList`, params, {
      headers: this.sendHeaderFun(secret)
    });
    return data;
  }


}

module.exports = ApiClient;