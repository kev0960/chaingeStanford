module.exports = function(dependencies) {
    const db = dependencies['db'];
    const zmq = dependencies['zmq'];
    const connect_node = dependencies['connect_node'];
    const uuid = dependencies['uuid'];
    const util = dependencies['util'];

    const create_data_txn = function(email, id_key, id_val, use_proxy) {
        return new Promise(function(resolve, reject) {
            // Create an unique token to identify the result
            const new_token = uuid();

            // new DATA_TXN is created but it does not generate
            // new rsa key.
            let data = {
                K : 20,
                identity : id_val,
                rsa_key_size : 2048,
                dh_key_size : 1024,
                token : new_token,
                type : 0,
                with_key : 0
            };

            console.log("Creating Transaction with :: ", data);

            // Now add a zmq callback to execute when the new transaction
            // is created from TXN generator (./main)

            zmq.add_callback_for_token(token, function(data) {
                // Retrieve the public and private key pair from
                // the db

                db.get_keys(email).then(function(keys) {
                    let pub_key = keys[0];
                    let prv_key = keys[1];

                    data["pub_key_pkcs8"] = pub_key;
                    data["prv_key_pkcs8"] = prv_key;

                    console.log(data);

                    let data_txn = util.create_data_txn_from_obj(data);

                    // Save the newly created data
                    db.save_user_txn(email, JSON.stringify({
                        "serial" : data_txn.serialize_data_txn,
                        "sig" : data_txn.signature,
                        "state" : "Pending",
                        "secret" : {
                            r_i : data_txn.r_i,
                            r : data_txn.r,
                            a : data_txn.a
                        },
                        "key" : id_key,
                        "value" : id_val
                    }));

                    db.save_txn_to_username(data_txn.signature, email);

                    db.save_pubkey_to_user_name(data.pub_key, email);
                    db.save_keys(email, data.pub_key, data.prv_key);
                    zmq.remove_token_callback(token);
                    resolve (data_txn);
                });

            });
            zmq.send_data(JSON.stringify(data));
        });
    }

    const req_txn_wrapper = function(email, target_email, id_key, id_val) {

    }

    const ans_txn_wrapper = function(email) {

    }

    return {
        create_data_txn,
        req_txn_wrapper,
        ans_txn_wrapper,
    };
}
