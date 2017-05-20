'use strict'

module.exports = function (dependencies) {
    const crypto = dependencies['crypto'];

    /**
     * NOTE THAT UNLIKE THE TRANSACTION.JS IN CHAINGE, THIS TRANSACTION
     * OBJECT DOES NOT CONVERT STRINGS INTO BIG INTEGER!
     */
    class Transaction {

        /**
         * Create Transaction Object from JSON string data.
         * A transaction object can be one of the following :
         *   a. DATA ; The identity of the user
         *   b. REQUEST ; Request to verify the identity
         *   c. ANSWER ; Either accepts or rejects the request
         *
         *  The structure of general Txn
         *
         *      PUBLIC-KEY
         *      SIGNATURE (of hash of payload)
         *      PAYLOAD -- Timestamp
         *              |- Type
         *              -- .. data
         *
         * @param {String or Object} If data is passed as string,
         * then data is in JSON format. If it is an object, then we
         * we can simply take it as txn object
         */
        constructor(data) {
            let txn = "";
            if (typeof data === 'string' || data instanceof String) {
                txn = JSON.parse(data);
            } else {
                txn = data;
            }

            this.deserialize_payload(txn.payload);

            this.signature = txn.signature; // Signature of Txn
            this.public_key = txn.public_key; // Public key of Txn

            // The location of the TXN is not specified in TXN.
            // However for convenience, we can keep the location data here.
            // The location will be pair of (block_num, relative position in Merkle tree)
            this.address = null;

            this.timestamp = this.payload.timestamp;
            this.type = this.payload.type;
        }

        /**
         * serializes this transaction to form a long JSON string
         * @returns {String}
         */
        serialize() {
            const payload_str = this.serialize_payload();
            let txn = stable_stringify({
                signature: this.signature,
                public_key: this.public_key,
                payload: payload_str
            });

            return txn;
        }

        /**
         * serializes the payload into a JSON string
         * @returns {String}
         */
        serialize_payload() {
            let txn_payload = {};
            const p = this.payload;

            // DATA Txn
            if (this.type == 0) {
                txn_payload = {
                    G: p.G,
                    g: p.g,
                    g_a: p.g_a,
                    g_r: p.g_r,
                    K: p.K,
                    secret: p.secret,
                    // Note that g_r_i is initially kepts as
                    // list of strings until that is actually
                    // used for Request verification
                    g_r_i: p.g_r_i,
                    encrypted: p.encrypted,
                    encrypted_key: p.encrypted_key,
                };
            } else if (this.type == 1) {
                txn_payload = {
                    g_b: p.g_b,
                    g_g_ab_p_r: p.g_g_ab_p_r,
                    req: p.req,
                    data_blk_num: p.data_blk_num,
                    data_txn_sig: p.data_txn_sig,
                }
            } else if (this.type == 2) {
                txn_payload = {
                    // Like g_r_i's case, response is again
                    // stored as the list of strings instead
                    // of list of big integers.
                    res: p.res,
                    data_blk_num: p.data_blk_num,
                    data_txn_sig: p.data_txn_sig,
                    req_blk_num: p.req_blk_num,
                    req_txn_sig: p.req_txn_sig
                }
            }

            txn_payload['timestamp'] = this.timestamp;
            txn_payload['type'] = this.type;

            return stable_stringify(txn_payload);
        }

        /**
         * Deserialize JSON payload data
         * @param {JSON} parsed JSON payload data
         */
        deserialize_payload(data) {
            if (typeof data === 'string' || data instanceof String) {
                data = JSON.parse(data)
            }

            this.payload = {};

            if (data.type == 0) {
                this.payload = {
                    G: data.G,
                    g: data.g,
                    g_a: data.g_a,
                    g_r: data.g_r,
                    K: data.K,
                    secret: data.secret,
                    g_r_i: data.g_r_i,
                    encrypted: data.encrypted,
                    encrypted_key: data.encrypted_key,
                }
            } else if (data.type == 1) {
                this.payload = {
                    g_b: data.g_b,
                    g_g_ab_p_r: data.g_g_ab_p_r,
                    req: data.req,
                    data_blk_num: data.data_blk_num,
                    data_txn_sig: data.data_txn_sig
                }
            } else if (data.type == 2) {
                this.payload = {
                    res: data.res,
                    data_blk_num: data.data_blk_num,
                    data_txn_sig: data.data_txn_sig,
                    req_blk_num: data.req_blk_num,
                    req_txn_sig: data.req_txn_sig
                }
            }


            this.payload['timestamp'] = data.timestamp;
            this.payload['type'] = data.type;
        }
        /**
         * Check whether txn is identical to this
         * @param {Transaction} txn
         * @returns {Boolean}
         */
        is_equal(txn) {
            if (txn.signature == this.signature &&
                txn.public_key == this.public_key) {
                return true;
            }
            return false;
        }

        get_signature() {
            return this.signature;
        }

        get_public_key() {
            return this.public_key;
        }

        /**
         * Returns the type of this Transaction in string
         */
        get_type() {
            return {
                0: "DATA",
                1: "REQUEST",
                2: "ANSWER"
            }[this.type];
        }
        /**
         * Check whether the timestamp of current block is not faster than
         * the current time
         */
        check_timestamp() {
            return Date.now() > this.timestamp;
        }

        /**
         * Checks whether the signature of this transaction is correct.
         * Note that Full verificatoin of validity of TXN is done in chain.js
         * It must check whether the TXNs that this TXN is referring to actually
         * matches to existing TXNs.
         */
        check_signature() {
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(this.serialize_payload());
            verify.end();

            return verify.verify(this.public_key, this.signature, 'hex');
        }

        /**
         * Return G
         * @returns {BigInteger} Returns G of Data Txn in a big integer object
         */
        get_G() {
            if (this.type == 0) {
                return this.payload.G;
            }
            throw "Invalid field 'G' is requested from block with type " + this.type;
        }

        /**
         * @returns {BigInteger} Returns g of Data Txn in a big integer object
         */
        get_g() {
            if (this.type == 0) {
                return this.payload.g;
            }
            throw "Invalid field 'g' is requested from block with type " + this.type;
        }

        /**
         * @returns {BigInteger} Returns g^r of Data Txn in a big integer object
         */
        get_g_r() {
            if (this.type == 0) {
                return this.payload.g_r;
            }

            throw "Invalid field 'g^r' is requested from block with type " + this.type;
        }

        /**
         * @returns {Array} Returns list of g^{r_i}s in string array
         */
        get_g_r_i() {
            if (this.type == 0) {
                return this.payload.g_r_i;
            }

            throw "Invalid field 'g_r_i' is requested from block with type " + this.type;
        }
        /**
         * @returns {BigInteger} Returns g^a of Data Txn in a big integer object
         */
        get_g_a() {
            if (this.type == 0) {
                return this.payload.g_a;
            }
            throw "Invalid field 'g^a' is requested from block with type" + this.type;
        }

        /**
         * @returns {BigInteger} Returns g^b of Request Txn in a big integer object
         */
        get_g_b() {
            if (this.type == 1) {
                return this.payload.g_b;
            }
            throw "Invalid field 'g^b' is requested from block with type " + this.type;
        }

        /**
         * @returns {BigInteger} Returns g^(g^(ab) + r) of Reqeust Txn in a big integer object
         */
        get_g_g_ab_p_r() {
            if (this.type == 1) {
                return this.payload.g_g_ab_p_r;
            }

            throw "Invalid field 'g^(g^(ab) + r)' is requested from block with type " + this.type;
        }

        get_K() {
            if (this.type == 0) {
                return this.payload.K;
            }

            throw "Invalid field 'K' is requested from block with type " + this.type;
        }

        get_secret() {
            if (this.type == 0) {
                return this.payload.secret;
            }

            throw "Invalid field 'secret' is requested from block with type " + this.type;
        }

        get_req() {
            if (this.type == 1) {
                return this.payload.req;
            }

            throw "Invalid field 'req' is requested from block with type " + this.type;
        }

        get_res() {
            if (this.type == 2) {
                return this.payload.res;
            }

            throw "Invalid field 'req' is requested from block with type " + this.type;
        }

        /**
         * @returns {Number} Returns Block number of Data Txn that this Txn is referring to.
         */
        get_data_blk_num() {
            if (this.type == 1 || this.type == 2) {
                return this.payload.data_blk_num;
            }

            throw "Invalid field 'data_blk_num' is requested from block with type" + this.type;
        }

        get_data_txn_sig() {
            if (this.type == 1 || this.type == 2) {
                return this.payload.data_txn_sig;
            }

            throw "Invalid field 'data_txn_sig' is requested from block with type" + this.type;
        }

        get_req_blk_num() {
            if (this.type == 2) {
                return this.payload.req_blk_num;
            }

            throw "Invalid field 'req_blk_num' is requested from block with type" + this.type;
        }

        get_req_txn_sig() {
            if (this.type == 2) {
                return this.payload.req_txn_sig;
            }

            throw "Invalid field 'req_txn_sig' is requested from block with type" + this.type;
        }

        get_encrypted_data() {
            if (this.type == 0) {
                return this.payload.encrypted;
            }

            throw "Invalid field 'encrypted' is requested for txn with type " + this.type;
        }

        get_encrypted_key() {
            if (this.type == 0) {
                return this.payload.encrypted_key;
            }

            throw "Invalid field 'encrypted_key' is requested for txn with type " + this.type;
        }
    }

    /**
     * Create a Transaction object from JSON string representing TXN.
     * @param {String} data; MUST BE JSON string representing the TXN
     */
    const create_transaction = function (data) {
        return new Transaction(data);
    }

    return {
        create_transaction,
    }
}