pragma circom 2.0.0;

/*
 * Token Holder Circuit  
 * Proves: user holds token with balance > 0 without revealing amount
 * 
 * Public inputs: tokenHash (hash of token address)
 * Private inputs: balance, tokenAddress
 * Output: 1 if holder, constraint fails otherwise
 */

include "circomlib/circuits/poseidon.circom";

template TokenHolder() {
    // Private inputs
    signal input balance;        // Token balance (secret)
    signal input tokenAddress;   // Token address as number (secret)
    
    // Public inputs
    signal input tokenHash;      // Hash of token address (public)
    
    // Output
    signal output valid;
    
    // Verify token address matches the public hash
    component hasher = Poseidon(1);
    hasher.inputs[0] <== tokenAddress;
    tokenHash === hasher.out;
    
    // Prove balance > 0
    // We need at least 1 token
    signal balanceMinusOne;
    balanceMinusOne <== balance - 1;
    
    // Decompose to prove non-negative (balance >= 1)
    signal bits[64];
    var bitsum = 0;
    
    for (var i = 0; i < 64; i++) {
        bits[i] <-- (balanceMinusOne >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;
        bitsum = bitsum + bits[i] * (1 << i);
    }
    
    balanceMinusOne === bitsum;
    
    valid <== 1;
}

component main {public [tokenHash]} = TokenHolder();
