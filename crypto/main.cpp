// g++ main.cpp -o main -lzmq ./libcryptopp.a -std=c++11

#include <zmq.hpp>
#include <string>
#include <iostream>
#include <unistd.h>
#include <vector>
#include <sstream>
#include "cryptopp/osrng.h"
#include "cryptopp/integer.h"
#include "cryptopp/nbtheory.h"
#include "cryptopp/dh.h"
#include "cryptopp/secblock.h"
#include "cryptopp/rsa.h"
#include "cryptopp/queue.h"
#include "cryptopp/pem.h"
#include "cryptopp/files.h"

// For our JSON support
#include "json.hpp"

using json = nlohmann::json;
using CryptoPP::AutoSeededRandomPool;
using CryptoPP::Integer;
using CryptoPP::ModularExponentiation;
using CryptoPP::DH;
using CryptoPP::SecByteBlock;
using CryptoPP::RSA;


using std::cout;
using std::stringstream;
using std::string;

struct RSAPair {
    string str_prv;
    string str_pub;

    public:
    RSAPair (int key_size) {
        CryptoPP::InvertibleRSAFunction rsa;
        AutoSeededRandomPool rnd;

        rsa.GenerateRandomWithKeySize(rnd, key_size);
        RSA::PrivateKey priv (rsa);
        RSA::PublicKey pub (rsa);

        CryptoPP::StringSink fs(str_prv);
        CryptoPP::PEM_Save(fs, priv);

        CryptoPP::StringSink fs2(str_pub);
        CryptoPP::PEM_Save(fs2, pub);
    }
};

class DataTxn {
    std::vector<string> str_g_r_i;
    std::vector<string> str_r_i;
    string str_G;
    string str_g;
    string str_a;
    string str_g_a;
    string str_r;
    string str_g_r;
    string str_secret;
    int K;

    // convert Integer object to string (in hex format!)
    string integer_to_string(Integer num) {
        stringstream ss;
        ss << std::hex << num;

        string s = ss.str();

        // std::hex prints the number in HEX but it appends 'h'
        // at the end of the string
        if (s[s.length() - 1] == 'h') {
            s.erase(s.begin() + s.length() - 1);
        }

        return s;
    }

    // g^{priv} == pub mod G
    void create_key_pair(AutoSeededRandomPool& rnd, DH& dh, Integer& priv, Integer& pub) {
        SecByteBlock block_priv (dh.PrivateKeyLength());
        SecByteBlock block_pub (dh.PublicKeyLength());

        dh.GenerateKeyPair(rnd, block_priv, block_pub);
        priv.Decode (block_priv, dh.PrivateKeyLength());
        pub.Decode (block_pub, dh.PublicKeyLength());

        return ;
    }

    public:

    // Create a data txn with given info.
    DataTxn(int bit_size, int K, string hashed_identity) : K(K) {
        AutoSeededRandomPool rnd;
        DH dh;

        // Generates safe prime G and its generator g.
        // "Safe prime" for DH structure is the prime p that is in form
        // 2q + 1 where q is an another prime.
        dh.AccessGroupParameters().GenerateRandomWithKeySize(rnd, bit_size);

        // Get G and g
        const Integer &G = dh.GetGroupParameters().GetModulus();
        const Integer &g = dh.GetGroupParameters().GetGenerator();

        // Key pairs for DH communication with Request TXN
        Integer g_a, a;
        create_key_pair (rnd, dh, a, g_a);

        // For encrypting secret key
        Integer r, g_r;
        create_key_pair(rnd, dh, r, g_r);

        // Create secret secret = g^r + hashed_identity
        Integer secret = g_r + Integer(hashed_identity.c_str());

        // Create 'tryouts' for ZKP
        for (int i = 0; i < K; i ++) {
            Integer zkp_r, zkp_g_r;
            create_key_pair(rnd, dh, zkp_r, zkp_g_r);

            str_r_i.push_back(integer_to_string(zkp_r));
            str_g_r_i.push_back(integer_to_string(zkp_g_r));
        }

        str_G = integer_to_string(G);
        str_g = integer_to_string(g);
        str_r = integer_to_string(r);
        str_g_r = integer_to_string(g_r);
        str_a = integer_to_string(a);
        str_g_a = integer_to_string(g_a);
        str_secret = integer_to_string(secret);
    }

    string serialize_data(string token) {
        cout << "Finding RSA pairs ... " << std::endl;
        RSAPair pair(2048);

        json j = {
            {"G" , str_G},
            {"g", str_g},
            {"r", str_r},
            {"g_r", str_g_r},
            {"a", str_a},
            {"g_a", str_g_a},
            {"secret", str_secret},
            {"g_r_i", str_g_r_i},
            {"r_i", str_r_i},
            {"pub_key", pair.str_pub},
            {"prv_key", pair.str_prv},
            {"K", K},
            {"token", token}
        };

        cout << j << std::endl;
        // Return the serialized JSON object
        return j.dump();
    }
};

int main () {
    //  Prepare our context and socket
    zmq::context_t context (1);
    zmq::socket_t socket (context, ZMQ_REP);
    socket.bind ("tcp://*:5555");

    while (true) {
        zmq::message_t request;

        //  Wait for next request from client
        socket.recv (&request);


        std::cout << "Request :: " << (char *)request.data() << std::endl;
        auto json_data = json::parse(string((char *)request.data()));

        std::cout << "Received Hello" << std::endl;

        //  Do some 'work'
        DataTxn txn(1024, 10, json_data["identity"]);
        RSAPair pair (2048);
        string serial = txn.serialize_data(json_data["token"]);

        //  Send reply back to client
        zmq::message_t reply (serial.length() + 1);
        memcpy ((void *) reply.data (), serial.c_str(), serial.length() + 1);
        socket.send (reply);
        cout << "Data is sent!" << std::endl;
    }
    return 0;
}