import { ContractFactory, ethers } from 'ethers';
import {
  linkedByteCode,
  expectRevert,
  getNetworkId,
  getGanacheProvider,
  expectEvent,
  increaseTime,
  DURATION,
} from 'magmo-devtools';
import { sign, Channel, CountingApp, toHex, asEthersObject, Address } from 'fmg-core';
import { BigNumber, bigNumberify } from 'ethers/utils';
import CommitmentArtifact from '../build/contracts/Commitment.json';
import RulesArtifact from '../build/contracts/Rules.json';
import testNitroAdjudicatorArtifact from '../build/contracts/TestNitroAdjudicator.json';
import { getCountingApp } from './CountingApp';
import { channelID as getChannelID } from 'fmg-core/lib/channel';
import { asCoreCommitment } from 'fmg-core/lib/test-app/counting-app';
import { CountingCommitment } from 'fmg-core/src/test-app/counting-app';
import { fromParameters, CommitmentType } from 'fmg-core/lib/commitment';

jest.setTimeout(20000);
let nitro: ethers.Contract;
const abiCoder = new ethers.utils.AbiCoder();
const provider = getGanacheProvider();
const providerSigner = provider.getSigner();

const DEPOSIT_AMOUNT = 255; //
const SMALL_WITHDRAW_AMOUNT = 10;
const ZERO_ADDRESS = "0x" + "0".repeat(40);

let nullOutcome: {} | any[];
const AUTH_TYPES = ['address', 'address', 'uint256', 'address'];

function depositTo(destination: any, value = DEPOSIT_AMOUNT): Promise<any> {
  return nitro.deposit(destination, { value });
}

async function withdraw(
  participant,
  destination: Address,
  signer = participant,
  amount = DEPOSIT_AMOUNT,
  senderAddr = null
): Promise<any> {
  senderAddr = senderAddr || await nitro.signer.getAddress();
  const authorization = abiCoder.encode(AUTH_TYPES, [participant.address, destination, amount, senderAddr]);

  const sig = sign(authorization, signer.privateKey);
  return nitro.withdraw(
    participant.address,
    destination,
    amount,
    sig.v,
    sig.r,
    sig.s,
    { gasLimit: 3000000 },
  );
}

async function setupContracts() {
  const networkId = await getNetworkId();

  testNitroAdjudicatorArtifact.bytecode = linkedByteCode(
    testNitroAdjudicatorArtifact,
    CommitmentArtifact,
    networkId,
  );
  testNitroAdjudicatorArtifact.bytecode = linkedByteCode(
    testNitroAdjudicatorArtifact,
    RulesArtifact,
    networkId,
  );

  const nitroFactory = await ContractFactory.fromSolidity(testNitroAdjudicatorArtifact, providerSigner);
  const deployTran = await nitroFactory.getDeployTransaction();
  const estimate = await provider.estimateGas(deployTran);
  nitro = await nitroFactory.deploy();
  await nitro.deployed();
  const unwrap = ({ challengeCommitment, finalizedAt, guaranteedChannel }) => ({ challengeCommitment, finalizedAt, guaranteedChannel, allocation: [], destination: [], });
  nullOutcome = { ...unwrap(await nitro.outcomes(nitro.address)) };
}
const getHexForCommitment = (commitment: CountingCommitment) => {
  return toHex(asCoreCommitment(commitment));
};
const getEthersObjectForCommitment = (commitment: CountingCommitment) => {
  return asEthersObject(asCoreCommitment(commitment));
};

const getOutcomeFromParameters = (parameters: any[]) => {
  const outcome = {
    destination: parameters[0],
    finalizedAt: ethers.utils.bigNumberify(parameters[1]),
    challengeCommitment: asEthersObject(fromParameters(parameters[2])),
    guaranteedChannel: parameters[3],
    allocation: parameters[4].map(a => a.toHexString()),
  };
  return outcome;
};

describe('nitroAdjudicator', () => {
  const aBal = ethers.utils.parseUnits('6', 'wei').toHexString();
  const bBal = ethers.utils.parseUnits('4', 'wei').toHexString();
  const allocation = [aBal, bBal];
  const differentAllocation = [bBal, aBal];

  let channel: Channel;
  let alice: ethers.Wallet;
  let aliceDest: ethers.Wallet;
  let bob: ethers.Wallet;
  let guarantor: ethers.Wallet;
  let commitment0;
  let commitment1;
  let commitment2;
  let commitment3;
  let commitment4;
  let commitment5;

  let commitment1alt;
  let commitment2alt;
  let conclusionProof;

  let CountingAppContract;

  beforeAll(async () => {
    await setupContracts();

    // alice and bob are both funded by startGanache in magmo devtools.
    alice = new ethers.Wallet("0x5d862464fe9303452126c8bc94274b8c5f9874cbd219789b3eb2128075a76f72");
    bob = new ethers.Wallet("0xdf02719c4df8b9b8ac7f551fcb5d9ef48fa27eef7a66453879f4d8fdc6e78fb1");
    guarantor = ethers.Wallet.createRandom();
    aliceDest = ethers.Wallet.createRandom();
    CountingAppContract = await getCountingApp();

    const participants = [alice.address, bob.address];
    const destination = [alice.address, bob.address];

    channel = {
      channelType: CountingAppContract.address,
      channelNonce: 0,
      participants,
    };

    const defaults = {
      channel,
      appCounter: new BigNumber(0).toHexString(),
      destination,
      allocation,
      commitmentCount: 1,
    };

    commitment0 = {
      ...defaults,
      commitmentType: CommitmentType.App,
      appCounter: new BigNumber(1).toHexString(),
      turnNum: 6,
    };
    commitment1 = {
      commitmentType: CommitmentType.App,
      ...defaults,
      turnNum: 7,
      appCounter: new BigNumber(2).toHexString(),
    };
    commitment2 = {
      ...defaults,
      commitmentType: CommitmentType.App,
      turnNum: 8,
      appCounter: new BigNumber(3).toHexString(),
    };
    commitment3 = {
      ...defaults,
      commitmentType: CommitmentType.App,
      turnNum: 9,
      appCounter: new BigNumber(4).toHexString(),
    };
    commitment4 = {
      ...defaults,
      commitmentType: CommitmentType.Conclude,
      turnNum: 10,
      appCounter: new BigNumber(5).toHexString(),
    };
    commitment5 = {
      ...defaults,
      commitmentType: CommitmentType.Conclude,
      turnNum: 11,
      appCounter: new BigNumber(6).toHexString(),
    };
    commitment1alt = {
      ...defaults,
      commitmentType: CommitmentType.App,
      channel,
      allocation: differentAllocation,
      turnNum: 7,
      appCounter: new BigNumber(2).toHexString(),
    };
    commitment2alt = {
      ...defaults,
      commitmentType: CommitmentType.App,
      channel,
      allocation: differentAllocation,
      turnNum: 8,
      appCounter: new BigNumber(3).toHexString(),
    };

    const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(commitment4), alice.privateKey);
    const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(commitment5), bob.privateKey);

    conclusionProof = {
      penultimateCommitment: getEthersObjectForCommitment(commitment4),
      ultimateCommitment: getEthersObjectForCommitment(commitment5),
      penultimateSignature: { v: v0, r: r0, s: s0 },
      ultimateSignature: { v: v1, r: r1, s: s1 },
    };
  });

  let expectedAssertions;

  beforeEach(() => {
    expectedAssertions = 1;
  });

  describe('Eth management', () => {
    describe('deposit', () => {
      it('works', async () => {
        const channelID = getChannelID(channel);
        await depositTo(channelID);
        const allocatedAmount = await nitro.holdings(channelID);

        expect(allocatedAmount.toNumber()).toEqual(DEPOSIT_AMOUNT);
      });

      it('fires a deposited event', async () => {
        const filter = nitro.filters.Deposited(null, null, null);
        const { emitterWitness, eventPromise } = expectEvent(nitro, filter);
        const channelID = getChannelID(channel);
        await depositTo(channelID);
        const event = await eventPromise;

        expect(emitterWitness).toBeCalled();

        expect(event.args.destination).toEqual(channelID);
        expect(event.args.amountDeposited).toEqual(bigNumberify(DEPOSIT_AMOUNT));
      });
    });

    describe('withdraw', () => {
      it('works when holdings[participant] >= amount and sent on behalf of participant', async () => {
        await depositTo(alice.address);

        const startBal = await provider.getBalance(aliceDest.address);
        const allocatedAtStart = await nitro.holdings(alice.address); // should be at least DEPOSIT_AMOUNT, regardless of test ordering

        // Alice can withdraw some of her money
        await withdraw(alice, aliceDest.address, alice, SMALL_WITHDRAW_AMOUNT);

        expect(Number(await provider.getBalance(aliceDest.address))).toEqual(
          Number(startBal.add(SMALL_WITHDRAW_AMOUNT)),
        );
        expect(Number(await nitro.holdings(alice.address))).toEqual(
          Number(allocatedAtStart - SMALL_WITHDRAW_AMOUNT),
        );

        // Alice should be able to withdraw all remaining funds allocated to her.
        await withdraw(alice, aliceDest.address, alice, allocatedAtStart - SMALL_WITHDRAW_AMOUNT);

        expect(Number(await provider.getBalance(aliceDest.address))).toEqual(
          Number(await provider.getBalance(aliceDest.address)),
        );
        expect(Number(await nitro.holdings(alice.address))).toEqual(0);
      });

      it('reverts when holdings[participant] > amount but not sent on behalf of participant', async () => {
        await depositTo(alice.address);
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => withdraw(alice, aliceDest.address, bob),
          'Withdraw: not authorized by participant',
        );
      });

      it('reverts when sent on behalf of participant but holdings[participant] < amount', async () => {
        await depositTo(alice.address);
        const allocated = await nitro.holdings(alice.address); // should be at least DEPOSIT_AMOUNT, regardless of test ordering
        expect.assertions(expectedAssertions);
        await expectRevert(() => withdraw(alice, aliceDest.address, alice, Number(allocated) + 100000));
      });

      it('reverts when unauthorized', async () => {
        await depositTo(alice.address);
        const allocated = await nitro.holdings(alice.address); // should be at least DEPOSIT_AMOUNT, regardless of test ordering
        expect.assertions(expectedAssertions);
        await expectRevert(() => withdraw(alice, aliceDest.address, alice, 0, alice.address), "Withdraw: not authorized by participant"); // alice doesn't sign transactions, so the signature is incorrect 
      });
    });

    describe('transfer', () => {
      it('works when \
          the outcome is final and \
          outcomes[fromChannel].destination is covered by holdings[fromChannel]', async () => {
          await depositTo(getChannelID(channel));
          await depositTo(guarantor.address);

          const allocationOutcome = {
            destination: [alice.address, bob.address],
            allocation,
            finalizedAt: ethers.utils.bigNumberify(1),
            challengeCommitment: getEthersObjectForCommitment(commitment0),
            guaranteedChannel: ZERO_ADDRESS,
          };
          const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
          await tx.wait();

          const allocatedToChannel = await nitro.holdings(getChannelID(channel));
          const allocatedToAlice = await nitro.holdings(alice.address);

          await nitro.transfer(getChannelID(channel), alice.address, allocation[0]);

          expect(await nitro.holdings(alice.address)).toEqual(allocatedToAlice.add(allocation[0]));
          expect(await nitro.holdings(getChannelID(channel))).toEqual(
            allocatedToChannel.sub(allocation[0]),
          );

        });

      it('reverts when the outcome is not final', async () => {
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(Date.now() + 1000),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx.wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.transfer(getChannelID(channel), aliceDest.address, allocation[0]),
          'Transfer: outcome must be final',
        );

      });

      it('reverts when the outcome is final but the destination is not covered', async () => {
        const allocated = await nitro.holdings(getChannelID(channel));
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation: [allocated.add(1), allocation[1]],
          finalizedAt: ethers.utils.bigNumberify(1),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx.wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.transfer(getChannelID(channel), alice.address, bigNumberify(allocated).add(1)),
          'Transfer: holdings[channel] must cover transfer',
        );

      });

      it('reverts when the outcome is final \
              and the destination is covered by holdings[channel] \
              but outcome.amount[destination] < amount', async () => {
          const value = bigNumberify(allocation[0]).add(allocation[1]).toHexString();
          await nitro.deposit(getChannelID(channel), { value });

          const allocationOutcome = {
            destination: [alice.address, bob.address],
            allocation,
            finalizedAt: ethers.utils.bigNumberify(1),
            challengeCommitment: getEthersObjectForCommitment(commitment0),
            guaranteedChannel: ZERO_ADDRESS,
          };
          const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
          await tx.wait();
          const transferAmount = bigNumberify(allocation[0]).add(1).toHexString();
          expect.assertions(expectedAssertions);
          await expectRevert(
            () => nitro.transfer(getChannelID(channel), alice.address, transferAmount),
            'Transfer: transfer too large',
          );

        });

      it('reverts when the destination is not in outcome.destination', async () => {
        const value = bigNumberify(allocation[0]).add(allocation[1]).toHexString();
        await nitro.deposit(getChannelID(channel), { value });

        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(1),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx.wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.transfer(getChannelID(channel), aliceDest.address, allocation[0]),
          'Transfer: transfer too large',
        );

      });

      it('reverts when finalizedAt is 0', async () => {
        const value = bigNumberify(allocation[0]).add(allocation[1]).toHexString();
        await nitro.deposit(getChannelID(channel), { value });

        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx.wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.transfer(getChannelID(channel), alice.address, allocation[0]),
          'Transfer: outcome must be present',
        );

      });
    });

    describe('claim', () => {
      const finalizedAt = 1;
      it('works', async () => {
        const recipient = bob.address;
        const guarantee = {
          destination: [bob.address, alice.address],
          allocation: [],
          finalizedAt: ethers.utils.bigNumberify(finalizedAt),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: getChannelID(channel),
        };
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(finalizedAt),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        await (await nitro.setOutcome(guarantor.address, guarantee)).wait();
        await (await nitro.setOutcome(getChannelID(channel), allocationOutcome)).wait();

        expect(getOutcomeFromParameters(await nitro.getOutcome(getChannelID(channel)))).toMatchObject(allocationOutcome);
        expect(getOutcomeFromParameters(await nitro.getOutcome(guarantor.address))).toMatchObject(guarantee);

        let startBal = 5;
        const claimAmount = 2;
        await (await nitro.deposit(guarantor.address, { value: startBal })).wait();

        // Other tests may have deposited into guarantor.address, but we
        // ensure that the guarantor has at least 5 in holdings
        startBal = await nitro.holdings(guarantor.address);
        expect(Number(await nitro.holdings(recipient))).toEqual(0);
        const bAllocation = bigNumberify(bBal).sub(claimAmount).toHexString();
        const allocationAfterClaim = [aBal, bAllocation];
        const expectedOutcome = {
          destination: [alice.address, bob.address],
          allocation: allocationAfterClaim,
          finalizedAt: ethers.utils.bigNumberify(finalizedAt),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };

        // guarantor = G
        // recipient = χ (bob)
        // outcome = (A: 5, χ: 5)
        // getChannelID(channel) = L
        // C_{G,χ}(2) [[􏰀G:5 􏰂→ (L|χ), L:(A : 5, χ : 5)]]􏰁 =
        // 􏰀  [[G:3 􏰂→ (L|χ), L:(A : 5, χ : 3), χ:2]]􏰁
        await (await nitro.claim(guarantor.address, recipient, claimAmount)).wait();

        const newOutcome = await nitro.getOutcome(getChannelID(channel));
        expect(getOutcomeFromParameters(newOutcome)).toMatchObject(expectedOutcome);
        expect(Number(await nitro.holdings(guarantor.address))).toEqual(startBal - claimAmount);
        expect(Number(await nitro.holdings(recipient))).toEqual(claimAmount);
      });

      it('reverts if guarantor is underfunded', async () => {
        const recipient = bob.address;
        const guarantee = {
          destination: [bob.address, alice.address],
          allocation: [],
          finalizedAt: ethers.utils.bigNumberify(finalizedAt),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: getChannelID(channel),
        };
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(finalizedAt),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        await (await nitro.setOutcome(getChannelID(channel), allocationOutcome)).wait();
        await (await nitro.setOutcome(guarantor.address, guarantee)).wait();

        const claimAmount = Number(await nitro.holdings(guarantor.address)) + 1;
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.claim(guarantor.address, recipient, claimAmount),
          'Claim: guarantor must be sufficiently funded',
        );
      });

      it('reverts if the recipient channel\'s outcome is not finalized', async () => {
        const recipient = bob.address;
        const guarantee = {
          destination: [bob.address, alice.address],
          allocation: [],
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: getChannelID(channel),
        };
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        await (await nitro.setOutcome(getChannelID(channel), allocationOutcome)).wait();
        await (await nitro.setOutcome(guarantor.address, guarantee)).wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.claim(guarantor.address, recipient, 0),
          'Claim: channel must be closed',
        );
      });
    });

    describe('setOutcome', () => {
      it('works', async () => {
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx.wait();

        const setOutcome = await nitro.getOutcome(getChannelID(channel));
        expect(getOutcomeFromParameters(setOutcome)).toMatchObject(allocationOutcome);
      });
    });

    describe('overlap', () => {
      it('returns funding when funding is less than the amount allocated to the recipient in the outcome', async () => {
        const recipient = alice.address;
        const outcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const funding = ethers.utils.bigNumberify(2);
        expect(await nitro.overlapPub(recipient, outcome, funding)).toEqual(funding);
      });

      it('returns funding when funding is equal to than the amount allocated to the recipient in the outcome', async () => {
        const recipient = alice.address;
        const outcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const funding = aBal;
        expect((await nitro.overlapPub(recipient, outcome, funding)).toHexString()).toEqual(funding);
      });

      it('returns the allocated amount when funding is greater than the amount allocated to the recipient in the outcome', async () => {
        const recipient = alice.address;
        const outcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const funding = bigNumberify(aBal).add(1).toHexString();
        expect((await nitro.overlapPub(recipient, outcome, funding)).toHexString()).toEqual(aBal);
      });

      it('returns zero when recipient is not a participant', async () => {
        const recipient = aliceDest.address;
        const outcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const funding = bigNumberify(aBal).add(1).toHexString();
        const zero = ethers.utils.bigNumberify(0);
        expect(await nitro.overlapPub(recipient, outcome, funding)).toEqual(zero);
      });
    });

    describe('remove', () => {
      it('works', async () => {
        const outcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const removeAmount = 2;
        const expectedBAllocation = bigNumberify(bBal).sub(removeAmount).toHexString();
        const allocationAfterRemove = [aBal, expectedBAllocation];

        const expectedOutcome = {
          destination: [alice.address, bob.address],
          allocation: allocationAfterRemove,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
        };


        const recipient = bob.address;
        const newOutcome = await nitro.removePub(outcome, recipient, removeAmount);

        expect(getOutcomeFromParameters(newOutcome)).toMatchObject(expectedOutcome);
      });
    });

    describe('reprioritize', () => {
      it('works when the guarantee destination length matches the allocation outcome\'s allocation length', async () => {
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };

        const guarantee = {
          destination: [bob.address, alice.address],
          allocation: [],
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: getChannelID(channel),
        };
        // const guarantee = [guarantor.address, getChannelID(channel),[bob.address, alice.address]];

        const expectedOutcome = {
          destination: [bob.address, alice.address],
          allocation: differentAllocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };

        const newOutcome = await nitro.reprioritizePub(allocationOutcome, guarantee);

        expect(getOutcomeFromParameters(newOutcome)).toMatchObject(expectedOutcome);
      });

      it('works when the guarantee destination length is less than the allocation outcome\'s allocation length', async () => {
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };

        const guarantee = {
          destination: [bob.address],
          allocation: [],
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: getChannelID(channel),
        };
        // const guarantee = [guarantor.address, getChannelID(channel),[bob.address, alice.address]];

        const expectedOutcome = {
          destination: [bob.address],
          allocation: [bBal],
          finalizedAt: ethers.utils.bigNumberify(0),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };

        const newOutcome = await nitro.reprioritizePub(allocationOutcome, guarantee);

        expect(getOutcomeFromParameters(newOutcome)).toMatchObject(expectedOutcome);
      });

    });

  });

  describe('ForceMove Protocol', () => {
    let challengee;
    let challenger;

    beforeAll(async () => {
      challengee = alice;
      challenger = bob;

      await setupContracts();
    });

    beforeEach(async () => {
      await (await nitro.setOutcome(getChannelID(channel), nullOutcome)).wait();
      // challenge doesn't exist at start of app
      expectedAssertions += 1;
      expect(
        await nitro.isChannelClosedPub(getChannelID(channel))
      ).toBe(false);
    });

    describe('concludeAndWithdraw', () => {
      it('works when the channel is not concluded', async () => {
        const total = bigNumberify(aBal).add(bBal);
        const channelId = getChannelID(channel);
        await depositTo(channelId, total.toNumber());
        const startBal = await provider.getBalance(aliceDest.address);
        const allocatedAtStart = await nitro.holdings(channelId);
        const participant = alice.address;
        const destination = aliceDest.address;
        const { destination: startDestination, allocation: startAllocation, challengeCommitment: startCommitment, finalizedAt, guaranteedChannel } = await nitro.getOutcome(getChannelID(channel));
        expect({ destination: startDestination, allocation: startAllocation, challengeCommitment: startCommitment, finalizedAt, guaranteedChannel }).toMatchObject(nullOutcome);

        const senderAddr = await nitro.signer.getAddress();
        const authorization = abiCoder.encode(AUTH_TYPES, [participant, destination, aBal, senderAddr]);

        const sig = sign(authorization, alice.privateKey);

        const tx = await nitro.concludeAndWithdraw(conclusionProof,
          alice.address,
          destination,
          aBal,
          sig.v,
          sig.r,
          sig.s,
          { gasLimit: 3000000 });
        await tx.wait();
        const outcomeAfterConclude = await nitro.getOutcome(getChannelID(channel));
        expect(asEthersObject(fromParameters(outcomeAfterConclude.challengeCommitment))).toMatchObject(conclusionProof.penultimateCommitment);
        expect(Number(await provider.getBalance(aliceDest.address))).toEqual(
          Number(startBal.add(aBal)),
        );
        expect(Number(await nitro.holdings(channelId))).toEqual(
          Number(bigNumberify(allocatedAtStart).sub(aBal)),
        );
      });
      it('works when the channel has been concluded', async () => {
        const total = bigNumberify(aBal).add(bBal);
        const channelId = getChannelID(channel);
        await depositTo(channelId, total.toNumber());
        const concludeTx = await nitro.conclude(conclusionProof);
        await concludeTx.wait();

        const participant = alice.address;
        const destination = aliceDest.address;
        const senderAddr = await nitro.signer.getAddress();
        const authorization = abiCoder.encode(AUTH_TYPES, [participant, destination, aBal, senderAddr]);

        const sig = sign(authorization, alice.privateKey);

        const startBal = await provider.getBalance(aliceDest.address);
        const allocatedAtStart = await nitro.holdings(channelId);

        const tx = await nitro.concludeAndWithdraw(conclusionProof,
          alice.address,
          destination,
          aBal,
          sig.v,
          sig.r,
          sig.s,
          { gasLimit: 3000000 });
        await tx.wait();
        const outcomeAfterConclude = await nitro.getOutcome(channelId);
        expect(asEthersObject(fromParameters(outcomeAfterConclude.challengeCommitment))).toMatchObject(conclusionProof.penultimateCommitment);
        expect(Number(await provider.getBalance(aliceDest.address))).toEqual(
          Number(startBal.add(aBal)),
        );
        expect(Number(await nitro.holdings(channelId))).toEqual(
          Number(bigNumberify(allocatedAtStart).sub(aBal)),
        );
      });
      it('reverts if it has already been concluded with a different proof', async () => {

        await depositTo(alice.address);
        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(1),
          challengeCommitment: getEthersObjectForCommitment(commitment5),
          guaranteedChannel: ZERO_ADDRESS,
        };
        const tx = await nitro.setOutcome(getChannelID(channel), allocationOutcome);
        await tx;

        const participant = alice.address;
        const destination = aliceDest.address;

        const senderAddr = await nitro.signer.getAddress();
        const authorization = abiCoder.encode(AUTH_TYPES, [participant, destination, aBal, senderAddr]);
        const sig = sign(authorization, alice.privateKey);
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.concludeAndWithdraw(conclusionProof,
            alice.address,
            destination,
            aBal,
            sig.v,
            sig.r,
            sig.s,
            { gasLimit: 3000000 }),
          "concludeAndWithdraw: channel already concluded with a different proof"
        );
      });
    });

    describe('conclude', () => {
      it('works when the conclusion proof is valid', async () => {
        const { destination: startDestination, allocation: startAllocation, challengeCommitment: startCommitment, finalizedAt, guaranteedChannel } = await nitro.getOutcome(getChannelID(channel));
        expect({ destination: startDestination, allocation: startAllocation, challengeCommitment: startCommitment, finalizedAt, guaranteedChannel }).toMatchObject(nullOutcome);

        const tx = await nitro.conclude(conclusionProof);
        await tx.wait();

        const { destination: endDestination, allocation: endAllocation, challengeCommitment } = await nitro.getOutcome(getChannelID(channel));

        expect(endDestination).toEqual([alice.address, bob.address]);
        expect(endAllocation.map(a => a.toHexString())).toEqual(allocation);
        expect(asEthersObject(fromParameters(challengeCommitment))).toMatchObject(conclusionProof.penultimateCommitment);
        // TODO: figure out how to test finalizedAt

      });

      it('reverts if it has already been concluded', async () => {
        const tx = await nitro.conclude(conclusionProof);
        await tx.wait();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.conclude(conclusionProof),
          "Conclude: channel must not be finalized"
        );
      });
    });

    describe('forceMove', () => {
      it('emits ForceMove', async () => {
        const agreedCommitment = commitment0;
        const challengeCommitment = commitment1;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        const signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 }
        ];

        expectedAssertions += 1;
        expect(await nitro.outcomeFinal(getChannelID(channel))).toBe(false);
        const filter = nitro.filters.ChallengeCreated(null, null, null);

        const { emitterWitness, eventPromise } = expectEvent(nitro, filter);

        const tx = await nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        await tx.wait();
        await eventPromise;

        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(true);

        expect(emitterWitness).toBeCalled();
      });

      it('reverts when the move is not valid', async () => {
        const agreedCommitment = commitment0;
        const challengeCommitment = commitment3;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        const signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 }
        ];

        expectedAssertions += 1;
        expect(await nitro.outcomeFinal(getChannelID(channel))).toBe(false);

        const tx = nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => tx,
          "Invalid transition: turnNum must increase by 1"
        );
      });

      it('reverts when the commitments are not signed', async () => {
        const agreedCommitment = commitment0;
        const challengeCommitment = commitment1;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(commitment3), challenger.privateKey);
        const signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 }
        ];

        expectedAssertions += 1;
        expect(await nitro.outcomeFinal(getChannelID(channel))).toBe(false);

        const tx = nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => tx,
          "ForceMove: challengeCommitment not authorized"
        );
      });

      it('reverts when the channel is closed', async () => {
        const agreedCommitment = commitment0;
        const challengeCommitment = commitment1;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        const signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 }
        ];

        const allocationOutcome = {
          destination: [alice.address, bob.address],
          allocation,
          finalizedAt: ethers.utils.bigNumberify(1),
          challengeCommitment: getEthersObjectForCommitment(commitment0),
          guaranteedChannel: ZERO_ADDRESS,
        };
        await (await nitro.setOutcome(getChannelID(channel), allocationOutcome)).wait();
        expectedAssertions += 1;
        expect(await nitro.outcomeFinal(getChannelID(channel))).toBe(true);

        const tx = nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        expect.assertions(expectedAssertions);
        await expectRevert(
          () => tx,
          "ForceMove: channel must be open"
        );
      });
    });

    describe('refute', () => {
      let agreedCommitment;
      let challengeCommitment;
      let refutationCommitment;
      let refutationSignature;
      let signatures;

      async function runBeforeRefute() {
        await (await nitro.setOutcome(getChannelID(channel), nullOutcome)).wait();
        // challenge doesn't exist at start of app
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(false);

        await nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        // challenge should be created
        expectedAssertions += 1;
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(true);
      }

      it('works', async () => {
        await runBeforeRefute();

        const { emitterWitness, eventPromise } = expectEvent(nitro, 'Refuted');
        await nitro.refute(getEthersObjectForCommitment(refutationCommitment), refutationSignature);

        await eventPromise;
        expect(emitterWitness).toBeCalled();

        // "challenge should be cancelled
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(false);
      });

      beforeAll(() => {
        agreedCommitment = commitment0;
        challengeCommitment = commitment1;
        refutationCommitment = commitment3;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 },
        ];

        const { r: r2, s: s2, v: v2 } = sign(getHexForCommitment(refutationCommitment), challenger.privateKey);
        refutationSignature = { r: r2, s: s2, v: v2 };
      });

      it('reverts when the channel is closed', async () => {
        await runBeforeRefute();

        // expired challenge exists at start of app
        await increaseTime(DURATION.days(2), provider);
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(true);

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.refute(getEthersObjectForCommitment(refutationCommitment), refutationSignature),
          "Refute: channel must be open"
        );
      });

      it('reverts when the refutationCommitment is not signed', async () => {
        await runBeforeRefute();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.refute(getEthersObjectForCommitment(refutationCommitment), signatures[0]),
          "Refute: move must be authorized"
        );
      });

      it('reverts when the refutationCommitment is invalid', async () => {
        await runBeforeRefute();

        const invalidRefutationCommitment = commitment3;
        invalidRefutationCommitment.turnNum = agreedCommitment.turnNum - 1;

        const { r: r3, s: s3, v: v3 } = sign(getHexForCommitment(invalidRefutationCommitment), challenger.privateKey);
        const invalidRefutationSignature = { r: r3, s: s3, v: v3 };

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.refute(getEthersObjectForCommitment(invalidRefutationCommitment), invalidRefutationSignature),
          "the refutationCommitment must have a higher nonce"
        );
      });
    });

    describe('respondWithMove', () => {
      let agreedCommitment;
      let challengeCommitment;
      let responseCommitment;

      let signatures;
      let responseSignature;

      beforeAll(() => {
        agreedCommitment = commitment0;
        challengeCommitment = commitment1;
        responseCommitment = commitment2;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 },
        ];

        const { r: r2, s: s2, v: v2 } = sign(getHexForCommitment(responseCommitment), challengee.privateKey);
        responseSignature = { r: r2, s: s2, v: v2 };
      });

      async function runBeforeRespond() {
        await (await nitro.setOutcome(getChannelID(channel), nullOutcome)).wait();
        // challenge doesn't exist at start of app
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(false);

        await nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        // challenge should be created
        expectedAssertions += 1;
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(true);
      }

      it('works', async () => {
        await runBeforeRespond();

        const { emitterWitness, eventPromise } = expectEvent(nitro, 'RespondedWithMove');
        await nitro.respondWithMove(getEthersObjectForCommitment(responseCommitment), responseSignature);

        await eventPromise;
        expect(emitterWitness).toBeCalled();

        // "challenge should be cancelled
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(false);
      });

      it('reverts when the channel is closed', async () => {
        await runBeforeRespond();

        // expired challenge exists at start of app
        await increaseTime(DURATION.days(2), provider);
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(true);

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.respondWithMove(getEthersObjectForCommitment(responseCommitment), responseSignature),
          "RespondWithMove: channel must be open"
        );
      });

      it('reverts when the responseCommitment is not signed', async () => {
        await runBeforeRespond();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.respondWithMove(getEthersObjectForCommitment(responseCommitment), signatures[0]),
          "RespondWithMove: move must be authorized"
        );
      });

      it('reverts when the responseCommitment is invalid', async () => {
        await runBeforeRespond();

        const invalidResponseCommitment = commitment3;

        const { r: r3, s: s3, v: v3 } = sign(getHexForCommitment(invalidResponseCommitment), challenger.privateKey);
        const invalidResponseSignature = { r: r3, s: s3, v: v3 };

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.respondWithMove(getEthersObjectForCommitment(invalidResponseCommitment), invalidResponseSignature),
          "Invalid transition: turnNum must increase by 1"
        );
      });
    });

    describe('alternativeRespondWithMove', () => {
      let agreedCommitment;
      let challengeCommitment;
      let alternativeCommitment;
      let responseCommitment;

      let signatures;
      let alternativeSignature;
      let responseSignature;

      beforeAll(() => {
        agreedCommitment = commitment0;
        challengeCommitment = commitment1;
        alternativeCommitment = commitment1alt;
        responseCommitment = commitment2alt;

        const { r: r0, s: s0, v: v0 } = sign(getHexForCommitment(agreedCommitment), challengee.privateKey);
        const { r: r1, s: s1, v: v1 } = sign(getHexForCommitment(challengeCommitment), challenger.privateKey);
        signatures = [
          { r: r0, s: s0, v: v0 },
          { r: r1, s: s1, v: v1 },
        ];

        const { r: r2, s: s2, v: v2 } = sign(getHexForCommitment(alternativeCommitment), challenger.privateKey);
        const { r: r3, s: s3, v: v3 } = sign(getHexForCommitment(responseCommitment), challengee.privateKey);

        alternativeSignature = { r: r2, s: s2, v: v2 };
        responseSignature = { r: r3, s: s3, v: v3 };
      });

      async function runBeforeAlternativeRespond() {
        await (await nitro.setOutcome(getChannelID(channel), nullOutcome)).wait();
        // challenge doesn't exist at start of app
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(false);

        await nitro.forceMove(
          getEthersObjectForCommitment(agreedCommitment),
          getEthersObjectForCommitment(challengeCommitment),
          ZERO_ADDRESS,
          signatures,
        );
        // challenge should be created
        expectedAssertions += 1;
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(true);
      }

      it('works', async () => {
        await runBeforeAlternativeRespond();

        const { emitterWitness, eventPromise } = expectEvent(nitro, 'RespondedWithAlternativeMove');
        await nitro.alternativeRespondWithMove(getEthersObjectForCommitment(alternativeCommitment), getEthersObjectForCommitment(responseCommitment), alternativeSignature, responseSignature);

        await eventPromise;
        expect(emitterWitness).toBeCalled();

        // "challenge should be cancelled
        expect(await nitro.isChallengeOngoing(getChannelID(channel))).toBe(false);
      });

      it('reverts when the channel is closed', async () => {
        await runBeforeAlternativeRespond();

        // expired challenge exists at start of app
        await increaseTime(DURATION.days(2), provider);
        expectedAssertions += 1;
        expect(
          await nitro.isChannelClosedPub(getChannelID(channel))
        ).toBe(true);

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.alternativeRespondWithMove(getEthersObjectForCommitment(alternativeCommitment), getEthersObjectForCommitment(responseCommitment), alternativeSignature, responseSignature),
          "AlternativeRespondWithMove: channel must be open"
        );
      });

      it('reverts when the responseCommitment is not authorized', async () => {
        await runBeforeAlternativeRespond();

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.alternativeRespondWithMove(getEthersObjectForCommitment(alternativeCommitment), getEthersObjectForCommitment(responseCommitment), alternativeSignature, alternativeSignature),
          "AlternativeRespondWithMove: move must be authorized"
        );
      });

      it('reverts when the responseCommitment is invalid', async () => {
        await runBeforeAlternativeRespond();

        const invalidResponseCommitment = commitment3;

        const { r: r3, s: s3, v: v3 } = sign(getHexForCommitment(invalidResponseCommitment), challenger.privateKey);
        const invalidResponseSignature = { r: r3, s: s3, v: v3 };

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.alternativeRespondWithMove(getEthersObjectForCommitment(alternativeCommitment), getEthersObjectForCommitment(invalidResponseCommitment), alternativeSignature, invalidResponseSignature),
          "Invalid transition: turnNum must increase by 1"
        );
      });

      it('reverts when the alternativeCommitment has the wrong turnNum', async () => {
        await runBeforeAlternativeRespond();

        const invalidAlternativeCommitment = commitment0;
        const invalidResponseCommitment = commitment1;

        const { r: r3, s: s3, v: v3 } = sign(getHexForCommitment(invalidAlternativeCommitment), challenger.privateKey);
        const invalidAlternativeSignature = { r: r3, s: s3, v: v3 };
        const { r: r4, s: s4, v: v4 } = sign(getHexForCommitment(invalidResponseCommitment), challenger.privateKey);
        const invalidResponseSignature = { r: r4, s: s4, v: v4 };

        expect.assertions(expectedAssertions);
        await expectRevert(
          () => nitro.alternativeRespondWithMove(getEthersObjectForCommitment(invalidAlternativeCommitment), getEthersObjectForCommitment(invalidResponseCommitment), invalidAlternativeSignature, invalidResponseSignature),
          "alternativeCommitment must have the same nonce as the challenge commitment"
        );
      });
    });
  });
});
