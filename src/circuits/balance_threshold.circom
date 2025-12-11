pragma circom 2.0.0;

/*
 * Balance Threshold Circuit
 * Proves: balance >= threshold without revealing actual balance
 * 
 * Public inputs: threshold
 * Private inputs: balance
 * Output: 1 if balance >= threshold, constraint fails otherwise
 */

template BalanceThreshold() {
    // Private input - the actual balance (kept secret)
    signal input balance;
    
    // Public input - the threshold to prove against
    signal input threshold;
    
    // Output signal
    signal output valid;
    
    // Calculate difference: balance - threshold
    signal diff;
    diff <== balance - threshold;
    
    // We need to prove diff >= 0
    // For this, we decompose diff into bits and verify it's non-negative
    // Using 64 bits to support large balances (up to 2^64 - 1)
    
    signal bits[64];
    var bitsum = 0;
    
    for (var i = 0; i < 64; i++) {
        bits[i] <-- (diff >> i) & 1;
        bits[i] * (bits[i] - 1) === 0; // Ensure each bit is 0 or 1
        bitsum = bitsum + bits[i] * (1 << i);
    }
    
    // Verify the bit decomposition matches the difference
    diff === bitsum;
    
    // If we reach here, balance >= threshold
    valid <== 1;
}

component main {public [threshold]} = BalanceThreshold();
