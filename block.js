// cSpell:ignore txn, merkle, txns, deserialized
"use strict";
module.exports = function (dependencies) {
    const merkle_tree = dependencies['merkle_tree']; // this is the merkle_tree class
    const crypto = dependencies['crypto'];
    const stable_stringify = dependencies['stable_stringify'];

    class BlockHeader {
        /**
         * Accepts data from the user to create a block and creates an
         * immutable block header that contains this information.
         *
         * @param {String} prev_hash
         * @param {Number} timestamp
         * @param {Number} nonce
         * @param {Number} difficulty
         */
        constructor(data) {
            // unpack the data. Later, we might not choose json
            var unpacked = JSON.parse(data);

            this.prev_hash = unpacked.prev_hash;
            this.timestamp = unpacked.timestamp;
            this.nonce = unpacked.nonce;
            this.difficulty = unpacked.difficulty;
            this.hash = unpacked.hash;
            this.num_txns = unpacked.num_txns;
            this.height = unpacked.height;
            this.root_hash = unpacked.root_hash;

            Object.freeze(this) // make block header immutable
        }

        get_root_hash() {
            return this.root_hash;
        }

        get_prev_hash() {
            return this.prev_hash;
        }

        get_timestamp() {
            return this.timestamp;
        }

        get_difficulty() {
            return this.difficulty;
        }

        get_nonce() {
            return this.nonce;
        }

        get_block_hash() {
            return this.hash;
        }

        get_height() {
            return this.height;
        }

        is_equal_to(header) {
            if (this.prev_hash != header.prev_hash) return false
            if (this.timestamp != header.timestamp) return false
            if (this.nonce != header.nonce) return false
            if (this.difficulty != header.difficulty) return false
            if (this.hash != header.hash) return false
            if (this.num_txns != header.num_txns) return false
            return true;
        }

        serialize() {
            let header_str = stable_stringify({
                prev_hash: this.prev_hash,
                timestamp: this.timestamp,
                nonce: this.nonce,
                difficulty: this.difficulty,
                hash: this.hash,
                num_txns: this.num_txns,
                height: this.height,
                root_hash:this.root_hash,
            });

            return header_str
        }
    }

    class Block {
        /**
         * data_obj = { payload : (JSON string of array)}
         * @param {JSON} data
         */
        constructor(data) {
            // de-serialize and construct a block
            var data_obj = JSON.parse(data); // this should spit an object
            this.header = new BlockHeader(data_obj['header']);

            // If the data already has merkle_tree, then we don't need to
            // create one
            if (data_obj['merkle_tree']) {
                this.merkle_tree = merkle_tree.create_merkle_tree_from_str(data_obj['merkle_tree']);
            } else {
                //this.merkle_tree = merkle_tree.create_merkle_tree_from_list(data_obj['block']);
                // TODO : this is a quick fix. I need to make sure where 'merkle_tree' is being made
                this.merkle_tree = merkle_tree.create_merkle_tree_from_str(data_obj['block'])
            }
        }

        /**
         * Returns the list of transactions.
         * @returns {Array}
         */
        get_txns () {
            return this.merkle_tree.get_node_as_list();
        }

        get_header() {
            return this.header;
        }

        get_root_hash() {
            return this.header.get_root_hash();
        }

        get_difficulty() {
            return this.header.get_difficulty();
        }

        get_block_hash() {
            return this.header.get_block_hash();
        }

        get_prev_hash() {
            return this.header.get_prev_hash();
        }

        get_timestamp() {
            return this.header.get_timestamp();
        }

        get_nonce() {
            return this.header.get_nonce();
        }

        get_height() {
            return this.header.get_height();
        }

        get_txn_by_hash(txn_hash) {
            return this.merkle_tree.find_txn_from_hash(txn_hash);
        }

        get_user_txn(key) {
            return this.merkle_tree.get_user_txn(key);
        }

        /**
         * checks if a given block is the same as this one.
         * this function not only checks the block hash, but also checks that
         * the two blocks are exactly same in its contents as well
         */
        is_equal_to(block) {
            if (!this.header.is_equal_to(block.header)) {
                return false;
            }
            if (!this.merkle_tree.is_equal_to(block.merkle_tree)) {
                return false;

            }
            return true
        }

        /**
         * serializes the given block instance into a long JSON string.
         * The json string consists of 2 parts ('["header" : something, "block": something]'
         * @returns {String}
         */
        serialize() {
            var header_str = this.header.serialize();
            // note that a block content is just the merkle tree.
            var payload_str = this.merkle_tree.serialize();

            var data = stable_stringify({
                header : header_str,
                merkle_tree : payload_str
            });

            // sanity check
            var new_block = new Block(data);
            if (!this.is_equal_to(new_block)) {
                throw "Block : Error while serializing. "
            }

            return stable_stringify({
                "header": header_str,
                "block": payload_str
            });
        }

        verify_block() {
            const block_hash = this.header.get_prev_hash() + this.merkle_tree.get_root_hash();
            return check_hash_satisfy_difficulty(block_hash, this.header.get_nonce(), this.header.get_difficulty());
        }

        find_txn(txn_sig) {
            return this.merkle_tree.find_txn_from_sig(txn_sig);
        }
    }

    const create_block = function (data) {
        //return new Block(prev_hash, timestamp, txns, difficulty)
        return new Block(data);
    }

    /**
     * Create an UNVERIFIED block from Txn list.
     * (Nonce would be empty string. )
     * @param {Array} list of serialized txns
     * @param {String} prev_hash
     * @param {Number} difficulty
     */
    const create_block_from_txn_list = function (list, prev_hash, nonce, difficulty, blk_height, time_stamp) {
        const merkle_tree = merkle_tree.create_merkle_tree_from_list(list);

        if (time_stamp === undefined) time_stamp = Date.now()

        var hash_gen = crypto.createHash('sha256');
        hash_gen.update(prev_hash + merkle_tree.get_root_hash() + nonce);
        var blk_hash = hash_gen.digest('hex');

        const block_header = {
            prev_hash: prev_hash,
            difficulty: difficulty,
            height: blk_height,
            num_txns: list.length,
            hash: blk_hash,
            timestamp: time_stamp,
            nonce: nonce,
            root_hash : merkle_tree.get_root_hash(),
        };

        const data = {
            header: stable_stringify(block_header),
            merkle_tree: merkle_tree.serialize(),
        };

        const new_block = new Block(stable_stringify(data));

        if (!new_block.verify_block()) {
            throw "NEW BLOCK DOES NOT MATCH "
        }

        return new_block
    }

    /**
     * Get the root hash of generated Merkle Tree.
     * @param {Array} list of Txns
     */
    const get_root_hash_from_txns = function (list) {
        const merkle_tree = merkle_tree.create_merkle_tree_from_list(list);
        return merkle_tree.get_root_hash();
    }

    /**
     * Check whether hash satisfies the difficulty of the block
     * @param {String} hash
     * @param {String} nonce
     * @param {Number} difficulty
     */
    const check_hash_satisfy_difficulty = function (hash, nonce, difficulty) {
        const new_hash = calculate_hash(hash, nonce);
        const zeros = new_hash.match(/^0*/);

        if (zeros[0].length != 0) {
            return zeros[0].length >= difficulty;
        }
        return false;
    }

    /**
     * Calculates hash based on hash and nonce
     * @param {String} hash
     * @param {String} nonce
     */
    const calculate_hash = function (hash, nonce) {
        var hash_gen = crypto.createHash('sha256');
        hash_gen.update(hash+nonce);
        return hash_gen.digest('hex');
    }

    const verify_block = function(blk) {
        return blk.verify_block();
    }

    return {
        create_block,
        check_hash_satisfy_difficulty,
        create_block_from_txn_list,
        get_root_hash_from_txns,
        verify_block,
    }
};