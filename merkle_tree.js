'use strict'

/*
        MERKLE TREE

                    ROOT=H(H+E)
                    /        \
                   /          \
             H=H(F+G)          E
            /       \           \
           /         \           \
    F=H(A+B)         G=H(C+D)     E
    /     \           /     \      \
   /       \         /       \      \
  A         B       C         D      E

Note: H() is some hash function

*/
module.exports = function (dependencies) {
    /* Unpack dependencies*/
    const crypto = dependencies['crypto'];

    /* Unpack class modules*/
    const transaction = dependencies['transaction'];

    const stable_stringify = dependencies['stable_stringify'];

    /* Constants. Should be imported from utils file later */
    const SHA_LEN = 8 //in hex
    const TXN_LEN = 256 // in hex. assume fixed txn size of 1024 bytes for now

    class MerkleTree {
        // leaves :: serialized transaction (string)
        constructor(data) {
            // http://stackoverflow.com/questions/767486
            // If 'data' is an array, then treat data as
            // array of txns.

            if (data.constructor === Array) {
                this.leaves = data;
                this.rows = [this.create_leave_hashes(this.leaves)];

                while (true) {
                    let row = this.create_row_from_below(this.rows[0]);
                    console.log(row.length);
                    // Insert row at the front
                    this.rows.unshift(row);

                    // When it reaches the root hash, tree gen is done.
                    if (row.length == 1) {
                        break;
                    }
                }

                this.root_hash = this.rows[0][0];
            }
            // This merkle tree can also be initialized by serialized
            // JSON string
            else {
                data = JSON.parse(data);

                // Each leaf is stored in the serialized fashion.
                this.leaves = data.leaves;
                this.rows = data.rows;
                this.root_hash = data.root_hash;
            }

            // The deserialized txns are only created when
            // the relevant function is called.
            this.deserialized_leaves = null;
        }

        // Generate the bottom of Merkle Tree from TXNs
        create_leave_hashes(leaves) {
            let bottom_row = [];
            for (let i = 0; i < leaves.length; i++) {
                bottom_row.push(calc_sha2_hash(stable_stringify(leaves[i])));
            }

            return bottom_row;
        }

        // Create parents from the leaves
        create_row_from_below(leaves) {
            let row = [];
            let num_leaves = leaves.length;

            while(num_leaves > 1) {
                let idx = leaves.length - num_leaves;
                row.push(calc_sha2_hash(leaves[idx] + leaves[idx+1]))
                num_leaves = num_leaves - 2;
            }

            // If there's one leafe remaining, bring it to next lev
            if (num_leaves == 1) {
                row.push(leaves[leaves.length - 1])
            }

            return row;
        }

        create_deserialized_leaves() {
            if (this.deserialized_leaves) {
                return;
            }

            this.deserialized_leaves = [];
            for (let i = 0; i < this.leaves.length; i++) {
                this.deserialized_leaves.push(transaction.create_transaction(this.leaves[i]));
            }
        }

        /**
         * Returns the Txn that corresponds to index i(the ith txn)
         * Use this for looping through all txns of a given Merkle tree
         * @param {Number} txn index
         * @returns {Transaction}
         */
        get_txn_at_index(i) {
            if (!this.deserialized_leaves) {
                this.create_deserialized_leaves();
            }
            return this.deserialized_leaves[i];
        }

        /**
         * Returns the root hash of the merkle tree
         * @returns {String} - the root hash
         */
        get_root_hash() {
            return this.root_hash;
        }

        /**
         * Check if two trees are the same
         * We don't really have to compare every elements
         * of the tree. We can simply compare the root hash
         * of the tree since there is almost 0% of collision.
         *
         * @param m_tree - other tree
         * @returns {boolean} True for equal
         */
        is_equal_to(m_tree) {
            if (this.leaves.length != m_tree.leaves.length) {
                return false;
            } else if (this.root_hash != m_tree.root_hash) {
                return false;
            }

            return true;
        }

        /**
         * Find the referring TXN from the signature.
         */
        find_txn_from_sig(txn_sig) {
            if (!this.deserialized_leaves) {
                this.create_deserialized_leaves();
            }

            for (let i = 0; i < this.deserialized_leaves.length; i++) {
                if (this.deserialized_leaves[i].get_signature() == txn_sig) {
                    return this.leaves[i];
                }
            }
            return null;
        }

        /**
         * Serializes this merkle tree so that it can be stored, sent away, etc.
         * @returns {String} - hex_data for the current merkle tree
         */
        serialize() {
            return stable_stringify({
                leaves: this.leaves,
                rows: this.rows,
                root_hash: this.root_hash
            });
        }

        get_user_txn(key) {
            if (!this.deserialized_leaves) {
                this.create_deserialized_leaves();
            }
            let txns = [];
            for (let i = 0; i < this.deserialized_leaves.length; i++) {
                if (this.deserialized_leaves[i].get_public_key() == key) {
                    txns.push(this.deserialized_leaves[i]);
                }
            }
            return txns;
        }

        /**
         * Get entire node as a list.
         * For block's case, the nodes will be txns.
         */
        get_node_as_list() {
            // Return the leafs that is stored after hash nodes
            // in this.tree
            return this.leaves;
        }

        /**
         * Get the list of transactions saved inside block
         *
         * @returns {null|Array}
         */
        get_txns_as_list() {
            this.create_deserialized_leaves();
            return this.deserialized_leaves;
        }
    }

    const calc_sha2_hash = function (str) {
        const sha2_hash = crypto.createHash('sha256');
        return sha2_hash.update(str).digest('hex');
    };

    const create_merkle_tree_from_list = function (list) {
        if (list.constructor === Array) {
            console.log("creating merkleTree");
            return new MerkleTree(list);
       } else
            throw "received not array"
    }

    const create_merkle_tree_from_str = function (str) {
        if (typeof str === 'string')
            return new MerkleTree(str);
    }


    return {
        create_merkle_tree_from_list,
        create_merkle_tree_from_str,
    }
};