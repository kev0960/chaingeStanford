// cSpell:ignore txn, merkle, txns, deserialized
// Manages the current list of blocks
module.exports = function (dependencies) {
  const block = dependencies['block'];
  const db = dependencies['db'];
  const util = dependencies['util'];

  // Current height of the GOOD block
  let good_block_height = -1;

  // When it receives the GOOD block from the node,
  // it checks whether it includes the transactions
  // that belongs to one of its users and changes its
  // status accordingly.
  const receive_good_block = function (block_data) {
    // Generate new block
    let new_block = block.create_block(block_data);

    let block_num = new_block.header.get_height();

    // Search through the block's included transactions
    new_block.merkle_tree.create_deserialized_leaves();
    let included_txns = new_block.merkle_tree.deserialized_leaves;

    console.log("Check start ", included_txns);
    // included_txns are now list of Transaction objects
    check_each_txn(included_txns, 0, block_num);
  }

  const check_each_txn = function (included_txns, current, block_num) {
    if (included_txns.length <= current) {
      return;
    }

    let current_txn = included_txns[current];
    let txn_signature = current_txn.get_signature();
    let txn_pub_key = current_txn.get_public_key();

    // Check whether TXN is accepted to the chain
    db.get_username_from_pubkey(txn_pub_key).then(
      function (username) {
        // If this transaction belongs to one of users
        if (username) {
          db.get_user_txn(username).then(function (list) {
            let found = false;
            for (let i = 0; i < list.length; i++) {
              let data = JSON.parse(list[i]);
              console.log("Comparing :: ", data.sig);
              console.log("with  ", txn_signature);
              if (data.sig == txn_signature) {
                data.state += '|ACCEPTED';

                // now that the block is safe, store block_num
                data['block_num'] = block_num;
                db.change_user_txn_at(username, JSON.stringify(data), i);

                found = true;
                break;
              }
            }

            // Then this transaction is created from somewhere else
            // Add it to my transactions list
            if (!found) {
              db.save_user_txn(username, JSON.stringify({
                "serial": current_txn.serialize(),
                "sig": txn_signature,
                "state": "ACCEPTED",
                "type" : 0,
                "block_num" : block_num
              }));
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

            db.get_user_txn(username).then(function(list) { 

              for (let i = 0; i < list.length; i++) {
                let data = JSON.parse(list[i]);

                // Found
                if (data.sig == current_txn.get_data_txn_sig()) {
                  data.state += '|REQUESTED' + txn_signature;

                  // save the request transaction to the requested user
                  let db_txn_entry = {
                    "serial" : curr_txn.serialize(),
                    "sig" : curr_txn.get_signature(),
                    "state" : "ACCEPTED",
                    "type": 1, 
                    "block_num" : block_num,
                  };

                  db.save_req_txn_for_user(username, db_txn_entry);

                  // turn the block_num for the creator, if in Stanford community
                  db.get_username_from_txn(current_txn.get_signature()).then(function(email) {

                    // The user who issued this req txn is in the stanford community
                    if (email != undefined && email != null) {

                      db.get_user_txn(email).then(function(list) {

                        // Find the req txn from the user's txn list and set blcoknum
                        for (let i = 0; i < list.length; i++) {
                            let data = util.parse_db_txn_entry(list[i]);

                            if (data.sig == current_txn.get_signature()) {
                                db.change_user_txn_at(email, db_txn_entry, i);
                                break;
                            }
                        }
                      });
                    }
                  });

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
                  data['block_num'] = block_num;
                  db.save_user_txn(username, JSON.stringify(data));
                }
              }
            });
          }
        }
      );
    }

    setTimeout(function () {
      check_each_txn(included_txns, current + 1, block_num);
    }, 0);
  };

  return {
    receive_good_block
  }
}
