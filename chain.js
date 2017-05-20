// cSpell:ignore txn, merkle, txns, deserialized
// Manages the current list of blocks
module.exports = function (dependencies) {
  const block = dependencies['block'];
  const db = dependencies['db'];

  // Current height of the GOOD block
  let good_block_height = -1;

  // When it receives the GOOD block from the node,
  // it checks whether it includes the transactions
  // that belongs to one of its users and changes its
  // status accordingly.
  const receive_good_block = function (block_data) {
    // Generate new block
    let new_block = block.create_block(block_data);

    // Search through the block's included transactions
    new_block.merkle_tree.create_deserialized_leaves();
    let included_txns = new_block.merkle_tree.create_deserialized_leaves;

    // included_txns are now list of Transaction objects
    check_each_txn(included_txns, 0);
  }

  const check_each_txn = function (included_txns, current) {
    if (included_txns.length <= current) {
      return;
    }

    let current_txn = included_txns[current];
    let txn_signature = current_txn.get_signature();

    // Check whether TXN is accepted to the chain
    db.get_username_from_txn(txn_signature).then(
      function (username) {
        // If this transaction belongs to one of users
        if (username) {
          db.get_user_txn(username).then(function (list) {
            for (let i = 0; i < list.length; i++) {
              let data = JSON.parse(list[i]);
              if (data.sig == txn_signature) {
                data.state += '|ACCEPTED';
                db.save_user_txn(username, JSON.stringify(data));
              }
            }
          });
        }
      }
    );

    // Check whether REQUEST TXN is requesting to one of our user's txn
    if (included_txns[current].get_type() == 'REQUEST') {
      db.get_username_from_txn(current_txn.get_data_txn_sig()).then(
        function (username) {
          if (username) {
            // Find exact TXN from user's TXN list
            db.get_user_txn(username).then(function (list) {
              for (let i = 0; i < list.length; i++) {
                let data = JSON.parse(list[i]);
                if (data.sig == current_txn.get_data_txn_sig()) {
                  data.state += '|REQUESTED' + txn_signature;
                  db.save_user_txn(username, JSON.stringify(data));
                }
              }
            });
          }
        }
      );
    }

    // Check whether ANSWER TXN to my REQUEST is created
    if (included_txns[current].get_type == 'ANSWER') {
      db.get_username_from_txn(current_txn.get_req_txn_sig()).then(
        function (username) {
          if (username) {
            db.get_user_txn(username).then(function (list) {
              for (let i = 0; i < list.length; i++) {
                let data = JSON.parse(list[i]);
                if (data.sig == current_txn.get_req_txn_sig()) {
                  data.state += '|ANSWERED' + txn_signature;
                  db.save_user_txn(username, JSON.stringify(data));
                }
              }
            });
          }
        }
      );
    }

    setTimeout(function () {
      check_each_txn(included_txns, current + 1, level);
    }, 0);
  };

  return {
    receive_good_block
  }
}