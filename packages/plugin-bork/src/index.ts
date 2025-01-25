import { Plugin } from "@elizaos/core";
import { WalletProvider, walletProvider } from "./providers/wallet.ts";
import fetchWalletData from "./actions/fetchWalletData.ts";
// import { analyzeWalletData } from "./evaluators/analyzeWalletData.ts";

export { WalletProvider, fetchWalletData };

export const borkPlugin: Plugin = {
    name: "bork",
    description: "Bork roasts the on-chain activities of a wallet of your choice",
    actions: [fetchWalletData],
    evaluators: [],
    providers: [walletProvider],
};

export default borkPlugin;
