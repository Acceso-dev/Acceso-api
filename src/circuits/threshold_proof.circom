pragma circom 2.0.0;

/*
 * Generic Threshold Circuit
 * Proves: value >= threshold for any numeric value
 * 
 * Use cases:
 * - Age verification (age >= 18)
 * - Credit score (score >= 700)
 * - Any numeric threshold proof
 * 
 * Public inputs: threshold
 * Private inputs: value
 */

template ThresholdProof() {
    // Private input - the actual value (kept secret)
    signal input value;
    
    // Public input - the threshold to prove against
    signal input threshold;
    
    // Output signal
    signal output valid;
    
    // Calculate difference: value - threshold
    signal diff;
    diff <== value - threshold;
    
    // Decompose to bits to prove non-negative
    signal bits[64];
    var bitsum = 0;
    
    for (var i = 0; i < 64; i++) {
        bits[i] <-- (diff >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;
        bitsum = bitsum + bits[i] * (1 << i);
    }
    
    diff === bitsum;
    valid <== 1;
}

component main {public [threshold]} = ThresholdProof();
