import { Channel } from './channel';
import abi from 'web3-eth-abi';
import { Uint32, Uint256, Address } from './types';
import { bigNumberify } from 'ethers/utils';

const SolidityCommitmentType = {
  "CommitmentStruct": {
    "channelType": "address",
    "channelNonce": "uint32",
    "participants": "address[]",
    "commitmentType": "uint8",
    "turnNum": "uint32",
    "commitmentCount": "uint32",
    "destination": "address[]",
    "allocation": "uint256[]",
    "appAttributes": "bytes",
  },
};

export interface BaseCommitment {
  channel: Channel;
  turnNum: Uint32;
  allocation: Uint256[];
  destination: Address[];
  commitmentCount: Uint32;
}

export interface Commitment extends BaseCommitment {
  commitmentType: CommitmentType;
  appAttributes: string;
}

export function toHex(commitment: Commitment): string {
  return abi.encodeParameter(SolidityCommitmentType, ethereumArgs(commitment));
}

export function fromHex(commitment: string): Commitment {
  const parameters = abi.decodeParameter(SolidityCommitmentType, commitment);
  return fromParameters(parameters);
}

export function fromParameters(parameters: any[]): Commitment {
  const channel = {
    channelType: parameters[0],
    channelNonce: Number.parseInt(parameters[1], 10),
    participants: parameters[3],
  };
  return {
    channel,
    commitmentType: Number.parseInt(parameters[4], 10) as CommitmentType,
    turnNum: Number.parseInt(parameters[5], 10),
    commitmentCount: Number.parseInt(parameters[6], 10),
    destination: parameters[7],
    allocation: parameters[8].map(a => bigNumberify(a).toHexString()),
    appAttributes: parameters[9],
  };
}

export function mover(commitment: Commitment) {
  return commitment.channel.participants[this.turnNum % this.channel.participants.length];
}

export function ethereumArgs(commitment: Commitment) {
  return [
    commitment.channel.channelType,
    commitment.channel.channelNonce,
    commitment.channel.participants,
    commitment.commitmentType,
    commitment.turnNum,
    commitment.commitmentCount,
    commitment.destination,
    commitment.allocation,
    commitment.appAttributes,
  ];
}

export function asEthersObject(commitment: Commitment) {
  return {
    channelType: commitment.channel.channelType,
    channelNonce: commitment.channel.channelNonce,
    participants: commitment.channel.participants,
    commitmentType: commitment.commitmentType,
    turnNum: commitment.turnNum,
    commitmentCount: commitment.commitmentCount,
    destination: commitment.destination,
    allocation: commitment.allocation,
    appAttributes: commitment.appAttributes,
  };
}

export enum CommitmentType {
  PreFundSetup = 0,
  PostFundSetup = 1,
  App = 2,
  Conclude = 3,
}