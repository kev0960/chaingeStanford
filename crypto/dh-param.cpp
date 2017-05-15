// g++ -g3 -ggdb -O0 -I. -I/usr/include/cryptopp dh-param.cpp -o dh-param.exe -lcryptopp -lpthread
// g++ -g -O2 -I. -I/usr/include/cryptopp dh-param.cpp -o dh-param.exe -lcryptopp -lpthread

#include <iostream>
using std::cout;
using std::cerr;
using std::endl;

#include <string>
using std::string;

#include <stdexcept>
using std::runtime_error;

#include <sstream>
using std::istringstream;

#include "cryptopp/osrng.h"
using CryptoPP::AutoSeededRandomPool;

#include "cryptopp/integer.h"
using CryptoPP::Integer;

#include "cryptopp/nbtheory.h"
using CryptoPP::ModularExponentiation;

#include "cryptopp/dh.h"
using CryptoPP::DH;

#include "cryptopp/secblock.h"
using CryptoPP::SecByteBlock;

int main(int argc, char** argv)
{
	AutoSeededRandomPool rnd;
	unsigned int bits = 2048;

	try
	{
		if(argc >= 2)
		{
			istringstream iss(argv[1]);
			iss >> bits;

			if(iss.fail())
				throw runtime_error("Failed to parse size in bits");

			if(bits < 6)
				throw runtime_error("Invalid size in bits");
		}

		cout << "Generating prime of size " << bits << " and generator" << endl;

		// Safe primes are of the form p = 2q + 1, p and q prime.
		// These parameters do not state a maximum security level based
		// on the prime subgroup order. In essence, we get the maximum
		// security level. There is no free lunch: it means more modular
		// mutliplications are performed, which affects performance.

		// For a compare/contrast of meeting a security level, see dh-init.zip.
		// Also see http://www.cryptopp.com/wiki/Diffie-Hellman and
		// http://www.cryptopp.com/wiki/Security_level .

		// CryptoPP::DL_GroupParameters_IntegerBased::GenerateRandom (gfpcrypt.cpp)
		// CryptoPP::PrimeAndGenerator::Generate (nbtheory.cpp)
		DH dh;
		dh.AccessGroupParameters().GenerateRandomWithKeySize(rnd, bits);

		if(!dh.GetGroupParameters().ValidateGroup(rnd, 3))
			throw runtime_error("Failed to validate prime and generator");

		size_t count = 0;

		const Integer& p = dh.GetGroupParameters().GetModulus();
		count = p.BitCount();
		cout << "P (" << std::dec << count << "): " << std::hex << p << endl;
		
		const Integer& q = dh.GetGroupParameters().GetSubgroupOrder();
		count = q.BitCount();
		cout << "Q (" << std::dec << count << "): " << std::hex << q << endl;

		const Integer& g = dh.GetGroupParameters().GetGenerator();
		count = g.BitCount();
		cout << "G (" << std::dec << count << "): " << std::dec << g << endl;

		// http://groups.google.com/group/sci.crypt/browse_thread/thread/7dc7eeb04a09f0ce
		Integer v = ModularExponentiation(g, q, p);
		if(v != Integer::One())
			throw runtime_error("Failed to verify order of the subgroup");
	}

	catch(const CryptoPP::Exception& e)
	{
		cerr << e.what() << endl;
	}

	catch(const std::exception& e)
	{
		cerr << e.what() << endl;
	}

	return 0;
}

