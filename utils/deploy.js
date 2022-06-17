const fs = require('fs');
const testUtils = require('../test/test-utils');
const { 
	GAS
} = getConfig();
const { 
	createOrInitAccount,
} = testUtils;


/// Manual deployment

/// create or get market account and deploy market.wasm (if not already deployed)
marketAccount = await createOrInitAccount(marketId, GUESTS_ACCOUNT_SECRET);
const marketAccountState = await marketAccount.state();
console.log('\n\nstate:', marketAccountState, '\n\n');
if (marketAccountState.code_hash === '11111111111111111111111111111111') {

    const marketContractBytes = fs.readFileSync('./out/market.wasm');
    console.log('\n\n deploying marketAccount contractBytes:', marketContractBytes.length, '\n\n');
    const newMarketArgs = {
        owner_id: contractId,
    };
    const actions = [
        deployContract(marketContractBytes),
        functionCall('new', newMarketArgs, GAS)
    ];
    await marketAccount.signAndSendTransaction(marketId, actions);
}
