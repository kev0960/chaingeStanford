const rsa = require('node-rsa');
const stable_stringify = require('stable-stringify')

module.exports = function (dependencies) {
    const protocol = dependencies['protocol'];

    const create_data_txn_from_obj = function (txn_data) {
        let str_pub_key = txn_data.pub_key;
        let str_prv_key = txn_data.prv_key;

        if (txn_data["pub_key_pkcs8"]) {
            str_pub_key = txn_data["pub_key_pkcs8"];
            str_prv_key = txn_data["prv_key_pkcs8"];
        }
        else {
            let prv_key = new rsa();
            prv_key.importKey(str_prv_key, 'pkcs1-private');

            let pub_key = new rsa();
            pub_key.importKey(str_pub_key, 'pkcs8-public');

            str_prv_key = prv_key.exportKey('pkcs8-private');
            str_pub_key = pub_key.exportKey('pkcs8-public');
        }

        const txn_payload = {
            G: txn_data.G,
            g: txn_data.g,
            g_a: txn_data.g_a,
            g_r: txn_data.g_r,
            K: txn_data.K,
            secret: txn_data.secret,
            g_r_i: txn_data.g_r_i,
            timestamp: Date.now(),
            type: 0
        }

        const txn_payload_str = stable_stringify(txn_payload);
        const txn_sig = protocol.create_sign(txn_payload_str, str_prv_key);

        const data_txn_obj = {
            public_key: str_pub_key,
            signature: txn_sig,
            payload: txn_payload_str
        };

        const serialize_data_txn = stable_stringify(data_txn_obj);

        return {
            r: txn_data.r,
            a: txn_data.a,
            r_i: txn_data.r_i,
            serialize_data_txn,
            pub_key: str_pub_key,
            prv_key: str_prv_key,
            signature : data_txn_obj.signature
        };
    }

    return {
        create_data_txn_from_obj
    }
};
