const BN = require('bn.js');
const fetch = require('node-fetch');
const nearAPI = require('near-api-js');
const path = require('path');
const { KeyPair, Account, Contract, utils: { format: { parseNearAmount } } } = nearAPI;
const { near, connection, keyStore, contract, contractAccount } = require('./near-utils');
const getConfig = require('../src/config');
const {
	networkId, contractName, contractMethods,
	DEFAULT_NEW_ACCOUNT_AMOUNT, 
	DEFAULT_NEW_CONTRACT_AMOUNT,
} = getConfig();

const homedir = require("os").homedir();
const CREDENTIALS_DIR = ".near-credentials";
const credentialsPath = path.join(homedir, CREDENTIALS_DIR);

const TEST_HOST = 'http://localhost:3000';
const getAccountBalance = async (accountId) => (new nearAPI.Account(connection, accountId)).getAccountBalance();

const createOrInitAccount = async(accountId, secret) => {
	let account;
	try {
		account = await createAccount(accountId, DEFAULT_NEW_CONTRACT_AMOUNT, secret);
	} catch (e) {
		if (!/because it already exists/.test(e.toString())) {
			throw e;
		}
		account = new nearAPI.Account(connection, accountId);

		console.log(await getAccountBalance(accountId));

		const newKeyPair = KeyPair.fromString(secret);
		keyStore.setKey(networkId, accountId, newKeyPair);
	}
	return account;
};

async function getAccount(accountId, fundingAmount = DEFAULT_NEW_ACCOUNT_AMOUNT) {
	console.log("credential", credentialsPath);
	const { connect } = nearAPI;
	const config = {
		networkId: "testnet",
		keyStore: new nearAPI.keyStores.UnencryptedFileSystemKeyStore(credentialsPath),
		nodeUrl: "https://rpc.testnet.near.org",
		walletUrl: "https://wallet.testnet.near.org",
		helperUrl: "https://helper.testnet.near.org",
		explorerUrl: "https://explorer.testnet.near.org",
	  };
	
	const near = await connect(config);
	const account = await near.account(accountId);

	return account;
};


async function getContract(account) {
	return new Contract(account || contractAccount, contractName, {
		...contractMethods,
		signer: account || undefined
	});
}


const createAccessKeyAccount = (key) => {
	connection.signer.keyStore.setKey(networkId, contractName, key);
	return new Account(connection, contractName);
};

const postSignedJson = async ({ account, contractName, url, data = {} }) => {
	return await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...data,
			accountId: account.accountId,
			contractName,
			...(await getSignature(account))
		})
	}).then((res) => {
		// console.log(res)
		return res.json();
	});
};

const postJson = async ({ url, data = {} }) => {
	return await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...data })
	}).then((res) => {
		console.log(res);
		return res.json();
	});
};

function generateUniqueSubAccount() {
	return `t${Date.now()}.${contractName}`;
}

/// internal
async function createAccount(accountId, fundingAmount = DEFAULT_NEW_ACCOUNT_AMOUNT, secret) {
	const contractAccount = new Account(connection, contractName);
	const newKeyPair = secret ? KeyPair.fromString(secret) : KeyPair.fromRandom('ed25519');
	await contractAccount.createAccount(accountId, newKeyPair.publicKey, new BN(parseNearAmount(fundingAmount)));
	keyStore.setKey(networkId, accountId, newKeyPair);
	return new nearAPI.Account(connection, accountId);
}

const getSignature = async (account) => {
	const { accountId } = account;
	const block = await account.connection.provider.block({ finality: 'final' });
	const blockNumber = block.header.height.toString();
	const signer = account.inMemorySigner || account.connection.signer;
	const signed = await signer.signMessage(Buffer.from(blockNumber), accountId, networkId);
	const blockNumberSignature = Buffer.from(signed.signature).toString('base64');
	return { blockNumber, blockNumberSignature };
};

module.exports = { 
	TEST_HOST,
	near,
	connection,
	keyStore,
	getContract,
	getAccountBalance,
	contract,
	contractName,
	contractMethods,
	contractAccount,
	createOrInitAccount,
	createAccessKeyAccount,
	getAccount, postSignedJson, postJson,
};


/// functionCallV2 console.warn upgrade helper

// [contractAccount, alice, bob].forEach((account) => {
// 	const temp = account.functionCall;
// 	const keys = ['contractId', 'methodName', 'args', 'gas', 'attachedDeposit'];
// 	account.functionCall = async (...args) => {
// 		if (typeof args[0] === 'string') {
// 			const functionCallOptions = {};
// 			args.forEach((arg, i) => {
// 				functionCallOptions[keys[i]] = arg;
// 			});
// 			console.warn(functionCallOptions);
// 		}
// 		return await temp.call(account, ...args);
// 	};
// });