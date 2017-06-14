'use strict';
module.exports = (function () {
    const big_int = require('big-integer');
    const node_rsa = require('node-rsa');
    const crypto = require('crypto');
    const stable_stringify = require('json-stable-stringify');

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
                    G: p.G.toString(16),
                    g: p.g.toString(16),
                    g_a: p.g_a.toString(16),
                    g_r: p.g_r.toString(16),
                    K: p.K,
                    secret: p.secret.toString(16),
                    // Note that g_r_i is initially kepts as
                    // list of strings until that is actually
                    // used for Request verification
                    g_r_i: p.g_r_i,
                    encrypted : p.encrypted,
                    encrypted_key : p.encrypted_key,
                };
            } else if (this.type == 1) {
                txn_payload = {
                    g_b: p.g_b.toString(16),
                    g_g_ab_p_r: p.g_g_ab_p_r.toString(16),
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
                    G: big_int(data.G, 16),
                    g: big_int(data.g, 16),
                    g_a: big_int(data.g_a, 16),
                    g_r: big_int(data.g_r, 16),
                    K: data.K,
                    secret: big_int(data.secret, 16),
                    g_r_i: data.g_r_i,
                    encrypted : data.encrypted,
                    encrypted_key : data.encrypted_key,
                }
            } else if (data.type == 1) {
                this.payload = {
                    g_b: big_int(data.g_b, 16),
                    g_g_ab_p_r: big_int(data.g_g_ab_p_r, 16),
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
            return time.now() > this.timestamp;
        }

        /**
         * Checks whether the signature of this transaction is correct.
         * Note that Full verification of validity of TXN is done in chain.js
         * It must check whether the TXNs that this TXN is referring to actually
         * matches to existing TXNs.
         */
        check_signature() {
            const verify = crypto.createVerify('RSA-SHA256');

            verify.write(stable_stringify(this.payload));
            verify.end();

            return verify.verify(this.public_key, this.signature);
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
                return this.payload.res();
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
    }

    const calc_sha2_hash = function (str) {
        const sha2_hash = crypto.createHash('sha256');
        return sha2_hash.update(str).digest('hex');
    };

    const create_sign = function (str, private_key) {
        const sign = crypto.createSign('RSA-SHA256');
        sign.write(str);
        sign.end();

        return sign.sign(private_key, 'hex');
    };

    const create_key_pair = function (size) {
        // Default value for size is 2048
        size = size || 2048;

        var key = new node_rsa({
            b: size
        });

        return {
            public_key: key.exportKey('pkcs8-public'),
            private_key: key.exportKey('pkcs8-private')
        }
    };

    const create_data_txn_from_obj = function (data_txn_obj) {
        return new Transaction (data_txn_obj);
    }

    const create_data_txn = function (private_key, public_key, id_key, identity) {
        console.log("Creating TXN!")
        // Defining g^a which is used for answering REQUEST

        // the Diffie Hellman G size should be around 2^2048 to be secure
        // But for test purposes, I just set as 2^128.
        const dh = crypto.createDiffieHellman(128);
        const G = big_int(dh.getPrime('hex'), 16);
        const g = big_int(dh.getGenerator('hex'), 16);
        const g_a = big_int(dh.generateKeys().toString('hex'), 16); // g^a
        const a = big_int(dh.getPrivateKey('hex'), 16);

        // r is secret to encrypt the hash of identity
        const r = big_int.randBetween(1, G - 1);
        const g_r = g.modPow(r, G);

        console.log("Diffie Hellman done!!!");
        const K = 3; // Default number of g^r_i s

        const g_r_i = []; // List of g^{r_i}s
        const r_i = []; // list of r_i s
        for (var i = 0; i < K; i++) {
            var x = big_int.randBetween(1, G - 1);
            r_i.push(x.toString(16));
            g_r_i.push(g.modPow(x, G).toString(16));
            console.log("Iteration #", i + 1);
        }

        const h_identity = big_int(calc_sha2_hash(identity), 16);
        const secret = h_identity.add(g_r); // g^r + H(M)

        // rsa encryption for the key/value Chainge storage
        var key = new node_rsa(public_key);
        var enc_id_key = key.encrypt(id_key, 'base64');
        var enc_identity = key.encrypt(identity, 'base64')

        const txn_payload = {
            G: G.toString(16),
            g: g.toString(16),
            g_a: g_a.toString(16),
            g_r: g_r.toString(16),
            K: K, // Number
            secret: secret.toString(16),
            g_r_i: g_r_i, // List of Strings
            timestamp: Date.now(), // Number
            type: 0, // Number
            encrypted: enc_identity,
            encrypted_key : enc_id_key,
        };

        const txn_payload_str = stable_stringify(txn_payload);
        console.log("TXN payload str :: ", txn_payload_str);
        console.log("pv key : ", private_key);
        const txn_sig = create_sign(txn_payload_str, private_key);
        const data_txn_obj = {
            public_key: public_key,
            signature: txn_sig,
            payload: txn_payload_str
        };

        const data_txn = new Transaction(data_txn_obj);
        const serialized_data_txn = stable_stringify(data_txn_obj);

        return {
            r: r.toString(16),
            a: a.toString(16),
            r_i,
            data_txn,
            serialized_data_txn
        };
    };

    /**
     * Create a Request Txn. The user must specify the DATA txn.
     * @param {String} private_key
     * @param {String} public_key
     * @param {Number} block number where the DATA txn locates
     * @param {String} Signature of that DATA txn
     * @param {String} The identity that the user is querying
     */
    const create_request_txn = function (private_key, public_key, block_num, txn_sig, asking_identity) {
        return new Promise(function (resolve, reject) {
            find_txn_at(block_num, txn_sig).then(
                function (data_txn) {
                    // If data_txn does not exist
                    if (!data_txn) {
                        console.log('Data txn does not exist at ', block_num, ' : ', txn_sig);
                        resolve();
                        return;
                    }

                    // G, g, g_a are BigInt objects
                    const G = data_txn.get_G();
                    const g = data_txn.get_g();
                    const g_a = data_txn.get_g_a();

                    let G_str = G.toString(16);
                    let g_str = g.toString(16);

                    if (G_str.length % 2 != 0) G_str = '0' + G_str;
                    if (g_str.length % 2 != 0) g_str = '0' + g_str;

                    const dh = crypto.createDiffieHellman(G_str, 'hex', g_str, 'hex');
                    const g_b = dh.generateKeys().toString('hex');
                    const b = dh.getPrivateKey('hex');

                    const g_ab = big_int(g_a.modPow(big_int(b, 16), G));
                    const identity_hash = big_int(calc_sha2_hash(asking_identity), 16);

                    const data_txn_secret = data_txn.get_secret();
                    const g_g_ab_p_r = g.modPow(g_ab, G).multiply(data_txn_secret.minus(identity_hash));

                    // Randomly asks to disclose one of r_i or r_i + r
                    const K = data_txn.get_K();
                    var req_str = "";
                    for (var i = 0; i < K; i++) {
                        if (Math.random() >= 0.5) req_str += '0';
                        else req_str += '1';
                    }

                    const req_payload = {
                        g_b: g_b.toString(16),
                        g_g_ab_p_r: g_g_ab_p_r.toString(16),
                        req: req_str,
                        data_blk_num: block_num, // Which DATA txn that
                        data_txn_sig: txn_sig, // this REQUEST txn refers to?
                        timestamp: Date.now(),
                        type: 1
                    };

                    const req_payload_str = stable_stringify(req_payload);
                    const req_sig = create_sign(req_payload_str, private_key);

                    const req_txn = {
                        public_key: public_key,
                        signature: req_sig,
                        payload: req_payload_str
                    };

                    const serialized_request_txn = stable_stringify(req_txn);

                    resolve({
                        b,
                        req_txn,
                        serialized_request_txn
                    });
                }
            );
        })
    };

    /**
     * Create ANSWER txn from REQUEST txn.
     * @param {String} public_key
     * @param {String} private_key
     * @param {Array} info; Array of required information (a, r, r_i, data_txn, req_txn)
     */
    const create_answer_txn = function (private_key, public_key, info) {
        return new Promise(function (resolve, reject) {
            let p_data_txn = find_txn_at(info['data_txn_blk_num'], info['data_txn_sig']);
            let p_req_txn = find_txn_at(info['req_txn_blk_num'], info['req_txn_sig']);

            Promise.all([p_data_txn, p_req_txn]).then(
                function (txns) {
                    let data_txn = txns[0];
                    let req_txn = txns[1];

                    // Both of the txn should be found!
                    if (!data_txn || !req_txn) {
                        resolve ();
                        return ;
                    }

                    const r = big_int(info['r'], 16);
                    const r_i = info['r_i'];
                    const a = big_int(info['a'], 16);

                    // G, g, g_a are BigInt objects
                    const G = data_txn.get_G();
                    const g = data_txn.get_g();
                    const g_b = req_txn.get_g_b();

                    const g_ab = big_int(g_b.modPow(a, G));
                    const request = req_txn.get_req().split('');
                    var response = [];

                    for (var i = 0; i < request.length; i++) {
                        var r_i_num = big_int(r_i[i], 16);

                        if (request[i] == 0) {
                            response.push(r_i_num.toString(16));
                        } else {
                            response.push(r_i_num.add(g_ab).add(r).toString(16));
                        }
                    }

                    const answer_payload = {
                        res: response,
                        data_blk_num: info['data_txn_blk_num'],
                        data_txn_sig: info['data_txn_sig'],
                        req_blk_num: info['req_txn_blk_num'],
                        req_txn_sig: info['req_txn_sig'],
                        timestamp: Date.now(),
                        type: 2,
                    }

                    const answer_payload_str = stable_stringify(answer_payload);
                    const ans_sig = create_sign(answer_payload_str, private_key);

                    const ans_txn = {
                        public_key: public_key,
                        signature: ans_sig,
                        payload: answer_payload_str
                    };

                    const serialized_ans_txn = stable_stringify(ans_txn);
                    resolve ({
                        ans_txn,
                        serialized_ans_txn
                    });
                }
            )
        });
    };

    const find_txn_at = function (block_num, txn_sig) {
        return new Promise(function (resolve, reject) {
            $.get("/chain/find_txn_at", {
                block_num: block_num,
                txn_sig: txn_sig
            }).done(
                function (result) {
                    if (result.value && result.err != 'not found') {
                        resolve(new Transaction(result.value))
                    } else resolve()

                    return;
                }
            )
        });
    };

    return {
        create_key_pair,
        create_data_txn,
        create_data_txn_from_obj,
        create_answer_txn,
        create_request_txn,
        create_sign
    }
}());
