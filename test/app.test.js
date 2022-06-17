const fs = require('fs');
const BN = require('bn.js');
const nearAPI = require('near-api-js');
const testUtils = require('./test-utils');
const getConfig = require('../src/config');

const {
	Contract, KeyPair, Account,
	utils: { format: { parseNearAmount } },
	transactions: { deployContract, functionCall },
} = nearAPI;
const {
	connection, getAccount, getAccountBalance,
	contract, contractAccount, contractName, contractMethods, createAccessKeyAccount,
	createOrInitAccount,
	getContract,
} = testUtils;
const {
	networkId, GAS, GUESTS_ACCOUNT_SECRET
} = getConfig();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

// this is used in creating the marketplace, tracks bids up to 3 most recent, default is 1
const BID_HISTORY_LENGTH = 1;
const DELIMETER = '||';

const now = Date.now();

/// contractAccount.accountId is the NFT contract and contractAccount is the owner
/// see initContract in ./test-utils.js for details
const contractId = contractAccount.accountId;
console.log('\n\n contractId:', contractId, '\n\n');
/// the test fungible token
const fungibleId = 'token-v3.cheddar.testnet';
/// the none fungible token
const nftId = 'nft.cheddar.testnet';
/// the market contract
const marketId = contractId;

describe('deploy contract ' + contractName, () => {

	let alice, bob, market, marketAccount, storageMarket;

	let aliceId = 'john31337.testnet';
	let bobId = 'john31336.testnet';

	const nft_contract_id = nftId;
	const token_type = fungibleId;
	// const token_type = "near";


	const tokenIds = ['78', '176', '188'];

	beforeAll(async () => {
		/// some users
		alice = await getAccount(aliceId);
		bob = await getAccount(bobId);
		storageMarket = parseNearAmount('0.01');

		market = await getAccount(marketId);
		const marketAccountState = await market.state();
		console.log('\n\nstate:', marketAccountState, '\n\n');
		// if (marketAccountState.code_hash === 'CjeCXm53yBUMH7w86ZUSY7SNMtAEZMcqeKsNRsxTdAAJ') {
		// 	marketAccount = await getAccount(marketId);
		// 	const marketContractBytes = fs.readFileSync('./out/main.wasm');
		// 	console.log('\n\n deploying marketAccount contractBytes:', marketContractBytes.length, '\n\n');
		// 	const newMarketArgs = {
		// 		owner_id: contractId,
		// 		bid_history_length: BID_HISTORY_LENGTH,
		// 	};
		// 	const actions = [
		// 		deployContract(marketContractBytes),
		// 		functionCall('new', newMarketArgs, GAS)
		// 	];
		// 	await marketAccount.signAndSendTransaction({ receiverId: marketId, actions });
		// }
	});

	test('alice approves a sale for a fixed amount of NEAR', async () => {
		console.log("marketId", marketId);
		const token_id = tokenIds[0];
		await alice.functionCall({
			contractId: marketId,
			methodName: 'storage_deposit',
			args: {},
			gas: GAS,
			attachedDeposit: parseNearAmount('0.01')
		});

		const price = 10;
		const period = 1000;

		await alice.functionCall({
			contractId: nftId,
			methodName: 'nft_approve',
			args: {
				token_id,
				account_id: marketId,
				msg: JSON.stringify({ period, token_type, price, nft_contract_id })
			},
			gas: GAS,
			attachedDeposit: parseNearAmount('0.01')
		});

		const sale = await alice.viewFunction(marketId, 'get_sale', {
			nft_contract_token: nftId + DELIMETER + token_id
		});
		console.log('\n\n get_sale result for nft', sale, '\n\n');
		expect(sale.price).toEqual(price);
	});

	test('token transfer', async () => {
		const token_id = tokenIds[0];
		try {
			await contractAccount.functionCall({
				nftId,
				methodName: 'nft_transfer',
				args: {
					receiver_id: bobId,
					token_id,
					approval_id: 0,
				},
				gas: GAS,
				attachedDeposit: 1
			});
			expect(false);
		} catch (e) {
			expect(true);
		}
	});

	test('get sales supply', async () => {
		const supply = await contractAccount.viewFunction(marketId, 'get_supply_sales', {});
		console.log('\n\n total supply sales', supply, '\n\n');
		expect(parseInt(supply, 10) > 0).toEqual(true);
	});

	test('get sales & supply by owner id', async () => {
		const sales_by_owner_id = await contractAccount.viewFunction(marketId, 'get_sales_by_owner_id', {
			account_id: aliceId,
			from_index: '0',
			limit: 50
		});
		console.log('\n\n sales_by_owner_id', sales_by_owner_id, '\n\n');
		expect(sales_by_owner_id.length).toEqual(1);

		const supply = await contractAccount.viewFunction(marketId, 'get_supply_by_owner_id', {
			account_id: aliceId,
		});
		console.log('\n\n get_supply_by_owner_id', supply, '\n\n');
		expect(parseInt(supply, 10) > 0).toEqual(true);
	});

	test('get sales & supply by nft contract id', async () => {
		const supply = await contractAccount.viewFunction(marketId, 'get_supply_by_nft_contract_id', {
			nft_contract_id: nftId,
		});
		console.log('\n\n get_supply_by_nft_contract_id', supply, '\n\n');
		expect(parseInt(supply, 10) > 0).toEqual(true);
	});

	test('alice purchase nft with NEAR', async () => {
		const token_id = tokenIds[0];
		const aliceBalanceBefore = await getAccountBalance(aliceId);
		/// purchase = near deposit = sale.price -> nft_transfer -> royalties transfer near
		const price = 50;
		await bob.functionCall({
			contractId: marketId,
			methodName: 'offer',
			args: {
				nft_contract_id: nftId,
				offer_price: price,
				token_id: token_id,
			},
			gas: GAS,
			attachedDeposit: parseNearAmount('0.01')
		});
	});


	test('bob withdraws storage', async () => {
		await bob.functionCall({
			contractId: marketId,
			methodName: 'storage_withdraw',
			args: {},
			gas: GAS,
			attachedDeposit: 1
		});
		const result = await contractAccount.viewFunction(marketId, 'storage_paid', { account_id: bobId });
		expect(result).toEqual('0');
	});

	test('bob outbids contract owner', async () => {
		const token_id = tokenIds[0];

		const offer_price = 500;

		await bob.functionCall({
			contractId: marketId,
			methodName: 'offer',
			args: {
				nft_contract_id: nftId,
				offer_price: offer_price,
				token_id
			},
			gas: GAS,
			attachedDeposit: parseNearAmount('0.01')
		});

		const sale = await bob.viewFunction(marketId, 'get_sale', { nft_contract_token: nftId + DELIMETER + token_id });
		console.log(sale);
		let bid = sale.bids[token_type].pop();
		console.log(bid);
		expect(bid.owner_id).toEqual(bobId);
		expect(bid.price).toEqual(offer_price.toString());
	});

	test('alice accept bid', async () => {
		const token_id = tokenIds[0];

		await alice.functionCall({
			contractId: marketId,
			methodName: 'accept_offer',
			args: {
				nft_contract_id: nftId,
				token_id: token_id
			},
			gas: GAS,
		});
	});

});