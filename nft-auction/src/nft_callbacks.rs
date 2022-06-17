use crate::*;
use log::info;
/// approval callbacks from NFT Contracts

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct SaleArgs {
    pub price: u128,
    pub period: u64,
    pub token_type: TokenType,
    pub nft_contract_id: AccountId
}

trait NonFungibleTokenApprovalsReceiver {
    fn nft_on_approve(
        &mut self,
        token_id: TokenId,
        owner_id: ValidAccountId,
        approval_id: u64,
        msg: String,
    );
}

#[near_bindgen]
impl NonFungibleTokenApprovalsReceiver for Contract {
    /// where we add the sale because we know nft owner can only call nft_approve

    fn nft_on_approve(
        &mut self,
        token_id: TokenId,
        owner_id: ValidAccountId,
        approval_id: u64,
        msg: String,
    ) {
        // enforce cross contract call and owner_id is signer
        info!("It works!");
        let SaleArgs { period, token_type, price, nft_contract_id } = 
            near_sdk::serde_json::from_str(&msg).expect("Not valid SaleArgs");

        // let nft_contract_id = env::predecessor_account_id();
        let signer_id = env::signer_account_id();
        assert_ne!(
            nft_contract_id.to_string(),
            signer_id.as_ref(),
            "nft_on_approve should only be called via cross-contract call"
        );
        assert_eq!(
            owner_id.as_ref(),
            &signer_id,
            "owner_id should be signer_id"
        );
        assert_eq!(
            period > 0,
            true,
            "end time must bigger than now"
        );
        let created_at = env::block_timestamp() / 1000000;
        let end_at = created_at + period;

        // enforce signer's storage is enough to cover + 1 more sale 

        let storage_amount = self.storage_amount().0;
        let owner_paid_storage = self.storage_deposits.get(&signer_id).unwrap_or(0);
        let signer_storage_required = (self.get_supply_by_owner_id(signer_id).0 + 1) as u128 * storage_amount;
        assert!(
            owner_paid_storage >= signer_storage_required,
            "Insufficient storage paid: {}, for {} sales at {} rate of per sale",
            owner_paid_storage, signer_storage_required / STORAGE_PER_SALE, STORAGE_PER_SALE
        );

        if let Some(token_type) = token_type {
            if !self.ft_token_ids.contains(&token_type) {
                env::panic(
                    format!("Token {} not supported by this market", token_type).as_bytes(),
                );
            }

            let bids = HashMap::new();

            let contract_and_token_id = format!("{}{}{}", nft_contract_id, DELIMETER, token_id);
            self.sales.insert(
                &contract_and_token_id,
                &Sale {
                    owner_id: owner_id.clone().into(),
                    approval_id,
                    nft_contract_id: nft_contract_id.to_string(),
                    token_id: token_id.clone(),
                    price,
                    bids,
                    created_at: U64(env::block_timestamp()/1000000),
                    end_at,
                    token_type: token_type,
                },
            );
    
            // extra for views
    
            let mut by_owner_id = self.by_owner_id.get(owner_id.as_ref()).unwrap_or_else(|| {
                UnorderedSet::new(
                    StorageKey::ByOwnerIdInner {
                        account_id_hash: hash_account_id(owner_id.as_ref()),
                    }
                    .try_to_vec()
                    .unwrap(),
                )
            });
    
            let owner_occupied_storage = u128::from(by_owner_id.len()) * STORAGE_PER_SALE;
            assert!(
                owner_paid_storage > owner_occupied_storage,
                "User has more sales than storage paid"
            );
            by_owner_id.insert(&contract_and_token_id);
            self.by_owner_id.insert(owner_id.as_ref(), &by_owner_id);
    
            let mut by_nft_contract_id = self.by_nft_contract_id.get(&nft_contract_id).unwrap_or_else(|| {
                    UnorderedSet::new(
                        StorageKey::ByNFTContractIdInner {
                            account_id_hash: hash_account_id(&nft_contract_id),
                        }
                        .try_to_vec()
                        .unwrap(),
                    )
                });
            by_nft_contract_id.insert(&contract_and_token_id);
            self.by_nft_contract_id
                .insert(&nft_contract_id, &by_nft_contract_id);
        }
    }
}
