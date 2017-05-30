// g++ main.cpp -o main -lzmq ./libcryptopp.a -std=c++11

#include <zmq.hpp>
#include <string>
#include <iostream>
#include <unistd.h>
#include <vector>
#include <sstream>
#include <bitset>
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

struct RSAPair
{
  string str_prv;
  string str_pub;

public:
  RSAPair(int key_size)
  {
    CryptoPP::InvertibleRSAFunction rsa;
    AutoSeededRandomPool rnd;

    rsa.GenerateRandomWithKeySize(rnd, key_size);
    RSA::PrivateKey priv(rsa);
    RSA::PublicKey pub(rsa);

    CryptoPP::StringSink fs(str_prv);
    CryptoPP::PEM_Save(fs, priv);

    CryptoPP::StringSink fs2(str_pub);
    CryptoPP::PEM_Save(fs2, pub);

    // Remove trailing newline character
    if (str_pub[str_pub.length() - 1] == '\n') {
      str_pub.erase(str_pub.length() - 1);
    }
    if (str_prv[str_prv.length() - 1] == '\n') {
      str_prv.erase(str_prv.length() - 1);
    }
  }
};

// g^{priv} == pub mod G
void create_key_pair(AutoSeededRandomPool &rnd, DH &dh, Integer &priv, Integer &pub)
{
  SecByteBlock block_priv(dh.PrivateKeyLength());
  SecByteBlock block_pub(dh.PublicKeyLength());

  dh.GenerateKeyPair(rnd, block_priv, block_pub);
  priv.Decode(block_priv, dh.PrivateKeyLength());
  pub.Decode(block_pub, dh.PublicKeyLength());

  return;
}

// convert Integer object to string (in hex format!)
string integer_to_string(Integer num)
{
  stringstream ss;
  ss << std::hex << num;

  string s = ss.str();

  // std::hex prints the number in HEX but it appends 'h'
  // at the end of the string
  if (s[s.length() - 1] == 'h')
  {
    s.erase(s.begin() + s.length() - 1);
  }

  return s;
}

class DataTxn
{
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

public:
  // Create a data txn with given info.
  DataTxn(int bit_size, int K, string hashed_identity) : K(K)
  {
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
    create_key_pair(rnd, dh, a, g_a);

    // For encrypting secret key
    Integer r, g_r;
    create_key_pair(rnd, dh, r, g_r);

    // Create secret secret = g^r + hashed_identity
    Integer secret = g_r + Integer(hashed_identity.c_str());

    // Create 'tryouts' for ZKP
    for (int i = 0; i < K; i++)
    {
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

  string serialize_data(string token)
  {
    cout << "Finding RSA pairs ... " << std::endl;
    RSAPair pair(2048);

    json j = {
        {"G", str_G},
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
        {"token", token}};

    cout << j << std::endl;
    // Return the serialized JSON object
    return j.dump();
  }
};

class RequestTxn
{
  Integer integer_with_hex(string hex)
  {
    // Insert '0x' at front
    hex.insert(0, "0x");

    return Integer(hex.c_str());
  }

  string str_b;
  string str_g_b;
  string str_g_g_ab_p_r;
  string req_str;

public:
  RequestTxn(string data_txn_json_str, string hashed_request_identity)
  {
    auto data_txn_json = json::parse(data_txn_json_str);

    Integer G = integer_with_hex(data_txn_json["txn_payload"]["G"]);
    Integer g = integer_with_hex(data_txn_json["txn_payload"]["g"]);
    Integer g_a = integer_with_hex(data_txn_json["txn_payload"]["g_a"]);
    Integer secret = integer_with_hex(data_txn_json["txn_payload"]["secret"]);
    int K = data_txn_json["txn_payload"]["K"];

    // Initialize DH structure with G and g of data_txn
    DH dh_req;
    dh_req.AccessGroupParameters().Initialize(G, g);

    // Generate b and g^b for request txn
    AutoSeededRandomPool rng;
    Integer b, g_b;
    create_key_pair(rng, dh_req, b, g_b);

    // Calculate the shared secret g^ab
    SecByteBlock shared (dh_req.AgreedValueLength());
    SecByteBlock sec_b (dh_req.PrivateKeyLength()), sec_g_a(dh_req.PublicKeyLength());

    b.Encode(sec_b, dh_req.PrivateKeyLength());
    g_a.Encode(sec_g_a, dh_req.PublicKeyLength());

    dh_req.Agree(shared, sec_b, sec_g_a);

    Integer g_ab;
    g_ab.Decode(shared, dh_req.AgreedValueLength());

    Integer identity_hash = integer_with_hex(hashed_request_identity);
    Integer g_g_ab_p_r = ModularExponentiation(g, g_ab, G) * (secret - identity_hash);

    string req_str = "";

    for (int i = 0; i < K; i ++) {
      Integer req (rng, 1);
      if (req == 1) {
        req_str.push_back('1');
      }
      else {
        req_str.push_back('0');
      }
    }

    str_b = integer_to_string(b);
    str_g_b = integer_to_string(g_b);
    str_g_g_ab_p_r = integer_to_string(g_g_ab_p_r);
  }

  string serialize_data(string token)
  {
    json j = {
      {"g_b", str_g_b},
      {"g_g_ab_p_r", str_g_g_ab_p_r},
      {"req", req_str},
      {"b", str_b},
      {"token", token}
    };

    cout << j << std::endl;
    return j.dump();
  }
};

class AnswerTxn
{
};

int main()
{
  //  Prepare our context and socket
  zmq::context_t context(1);
  zmq::socket_t socket(context, ZMQ_REP);
  socket.bind("tcp://*:5555");

  cout << "---------- TXN Calculator is started ---------------" << std::endl;

  while (true)
  {
    zmq::message_t request;

    //  Wait for next request from client
    socket.recv(&request);

    std::cout << "Request :: " << (char *)request.data() << std::endl;
    auto json_data = json::parse(string((char *)request.data()));
    string serial = "";

    // Request for generating DATA TXN
    if (json_data["type"] == 0) {
      //  Do some 'work'
      DataTxn txn(1024, 10, json_data["identity"]);

      cout << "Generating Key pairs..." << std::endl;
      serial = txn.serialize_data(json_data["token"]);
    }
    // Request for generating REQUEST TXN
    else if (json_data["type"] == 1) {
      RequestTxn txn(json_data["data_txn"], json_data["identity"]);
      serial = txn.serialize_data(json_data["token"]);
    }

    //  Send reply back to client
    zmq::message_t reply(serial.length() + 1);
    memcpy((void *)reply.data(), serial.c_str(), serial.length() + 1);
    socket.send(reply);
    cout << "Data is sent!" << std::endl;
  }
  return 0;
}