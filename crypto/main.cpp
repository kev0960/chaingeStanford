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

  std::vector<string> encrypt(std::vector<string> msgs)
  {
    AutoSeededRandomPool rnd;
    CryptoPP::InvertibleRSAFunction rsa;

    RSA::PrivateKey priv (rsa);
    RSA::PublicKey pub(rsa);

    CryptoPP::StringSink fs(str_prv);
    CryptoPP::PEM_Load(fs, priv);

    CryptoPP::StringSink fs2(str_pub);
    CryptoPP::PEM_Load(fs2, pub);

    CryptoPP::RSAES_OAEP_SHA_Encryptor encryptor(pub);
    std::vector<string> cipher_list;


    for (unsigned int i = 0; i < msgs.size(); i ++) {
      string cipher;
      CryptoPP::StringSource ss1(msgs[i], true,
          new CryptoPP::PK_EncryptorFilter(rnd, encryptor,
            new CryptoPP::StringSink(cipher)
            )
          );
      cipher_list.push_back(cipher);
    }

    return cipher_list;
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
  Integer integer_with_hex(string hex)
  {
    // Insert '0x' at front
    hex.insert(0, "0x");

    return Integer(hex.c_str());
  }


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
  DataTxn(int bit_size, int K, string hashed_identity)
    : K(K)
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
    Integer secret = g_r + integer_with_hex(hashed_identity);

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

  // If it is supplied with RSA private key, 
  string serialize_data_without_rsa_key(string token) 
  {
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
  RequestTxn(string str_G, string str_g, string str_g_a, string str_secret, int K, string hashed_request_identity)
  {

    Integer G = integer_with_hex(str_G);
    Integer g = integer_with_hex(str_g);
    Integer g_a = integer_with_hex(str_g_a);
    Integer secret = integer_with_hex(str_secret);

    cout << "K :: " << K;

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

    req_str = "";

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

  Integer integer_with_hex(string hex)
  {
    // Insert '0x' at front
    hex.insert(0, "0x");

    return Integer(hex.c_str());
  }

  std::vector<string> response;

  public:

  AnswerTxn(string str_G, string str_g, string str_g_b, std::vector<string> r_i_list, string str_r, string str_a, string request) {

    Integer a = integer_with_hex(str_a);
    Integer G = integer_with_hex(str_G);
    Integer g = integer_with_hex(str_g);

    Integer g_b = integer_with_hex(str_g_b);
    Integer g_ab = ModularExponentiation(g_b, a, G);

    Integer r = integer_with_hex(str_r);

    for (unsigned int i = 0; i < request.size(); i ++) {
      if (request[i] == '0') {
        response.push_back(r_i_list[i]);
      }
      else if (request[i] == '1') {
        Integer r_i_num = integer_with_hex(r_i_list[i]);
        Integer resp = r_i_num + r + g_ab;
        response.push_back(integer_to_string(resp));
      }
    }
  }

  string serialize_data(string token) {
    json j = {
      {"response", response},
      {"token", token}
    };

    cout << j << std::endl;
    return j.dump();
  }
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
    cout << std::endl << std::endl << std::endl;
    string data_str = string((char*)request.data());
    string sub_str = data_str.substr(0, data_str.rfind("END{}OF"));
    std::cout << sub_str << std::endl;

    auto json_data = json::parse(sub_str);
    string serial = "";

    // Request for generating DATA TXN
    if (json_data["type"] == 0) {
      //  Do some 'work'
      DataTxn txn(1024, 10, json_data["identity"]);
      cout << "Generating Key pairs..." << std::endl;

      //
      // If 'with_key' flag is enabled, then you must supply the 
      // newly generated rsa key. 
      if (json_data["with_key"] == 1) {
        serial = txn.serialize_data(json_data["token"]);
      }
      else {
        serial = txn.serialize_data_without_rsa_key(json_data["token"]);
      }
    }
    // Request for generating REQUEST TXN
    else if (json_data["type"] == 1) {
      std::cout << json_data["token"] << std::endl;

      string G = json_data["data_txn"]["txn_payload"]["G"];
      string g = json_data["data_txn"]["txn_payload"]["g"];
      string g_a = json_data["data_txn"]["txn_payload"]["g_a"];
      string secret = json_data["data_txn"]["txn_payload"]["secret"];
      int K = json_data["data_txn"]["txn_payload"]["K"];

      string hashed_identity = json_data["identity"];

      try {
        RequestTxn txn(G, g, g_a, secret, K, hashed_identity);
        serial = txn.serialize_data(json_data["token"]);
      }
      catch (std::exception e) {
        std::cout << "Error :: " << e.what() << std::endl;
      }
    }
    else if (json_data["type"] == 2) {
      string G = json_data["G"];
      string g = json_data["g"];
      string g_b = json_data["g_b"];
      std::vector<string> r_i = json_data["r_i"];
      string r = json_data["r"];
      string a = json_data["a"];
      string req = json_data["req"];

      AnswerTxn txn(G, g, g_b, r_i, r, a, req);
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
